import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

async function parse({
  log,
  send,
  error,
  close,
  question,
}: {
  log: (msg: string) => void;
  send: (msg: string) => void;
  error: (msg: Error | unknown) => void;
  close: () => void;
  question: string;
}) {
  const url =
    "https://ssattiraju-llmops-endpoint.swedencentral.inference.ml.azure.com/score";
  const apiKey = process.env.DOC_PROCSSOR_KEY;

  try {
    log("Connecting to " + url);
    log("Parameters: " + JSON.stringify({ question }));
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: "Bearer " + apiKey,
        "azureml-model-deployment": "web-researcher-01",
      },
      body: JSON.stringify({
        question: question,
        test: "false",
      }),
    });

    log("Response status: " + response.status);

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      const readStream = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          log("Chunk received: " + chunk);

          send(chunk);
        }
      };

      await readStream();
      close();
    }
  } catch (err) {
    error(new Error("Failed to connect to SSE: " + err));
  }
}

export async function POST(req: NextRequest) {
  const { question } = await req.json();
  console.log("Received question: " + question);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (msg: string) => {
        if (!closed) {
          controller.enqueue(encoder.encode(msg + "\n\n"));
        }
      };

      const close = () => {
        if (!closed) {
          controller.close();
          closed = true;
        }
      };

      parse({
        log: (msg: string) => {
          console.log(msg);
        },
        send,
        error: (err: Error | unknown) => {
          send("data: " + (err instanceof Error ? err.message : String(err)));
          close();
        },
        close,
        question,
      })
        .then(() => {
          console.info("Done");
          close();
        })
        .catch((e) => {
          console.error("Failed", e);
          close();
        });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Content-Encoding": "none",
    },
  });
}
