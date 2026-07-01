import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

export type EmailSendResult = {
  sent: boolean;
  provider: "ses" | "resend";
  from: string;
  reason: string | null;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
};

const DEFAULT_FROM_EMAIL = "DropLink <support@droplink.lat>";

let sesClient: SESv2Client | null = null;

function emailProvider(): "ses" | "resend" {
  const configured = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (configured === "resend") return "resend";
  if (configured === "ses" || configured === "aws-ses" || configured === "amazon-ses") return "ses";
  return process.env.RESEND_API_KEY ? "resend" : "ses";
}

export function emailFromAddress() {
  return process.env.DROPLINK_FROM_EMAIL || DEFAULT_FROM_EMAIL;
}

function replyToAddresses(input: SendEmailInput) {
  const replyTo = input.replyTo || process.env.DROPLINK_REPLY_TO_EMAIL || "";
  return replyTo ? [replyTo] : undefined;
}

async function sendViaSes(input: SendEmailInput): Promise<EmailSendResult> {
  const from = emailFromAddress();
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) {
    return { sent: false, provider: "ses", from, reason: "AWS_REGION is required for Amazon SES." };
  }
  sesClient ||= new SESv2Client({ region });
  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [input.to] },
      ReplyToAddresses: replyToAddresses(input),
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: input.html, Charset: "UTF-8" },
            Text: { Data: input.text, Charset: "UTF-8" }
          }
        }
      }
    })
  );
  return { sent: true, provider: "ses", from, reason: null };
}

async function sendViaResend(input: SendEmailInput): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = emailFromAddress();
  if (!apiKey) {
    return { sent: false, provider: "resend", from, reason: "RESEND_API_KEY is required." };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo || process.env.DROPLINK_REPLY_TO_EMAIL || undefined
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend rejected email: ${body || response.statusText}`);
  }
  return { sent: true, provider: "resend", from, reason: null };
}

export async function sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
  const provider = emailProvider();
  if (provider === "resend") return sendViaResend(input);
  return sendViaSes(input);
}
