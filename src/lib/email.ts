import nodemailer from "nodemailer";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const FROM = process.env.EMAIL_FROM ?? "KeyCrypt <noreply@keycrypt.app>";

async function getTransport() {
  // In development, log emails to the console instead of sending
  if (process.env.NODE_ENV !== "production") {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function send(to: string, subject: string, html: string) {
  const transport = await getTransport();
  const info = await transport.sendMail({ from: FROM, to, subject, html });

  if (process.env.NODE_ENV !== "production") {
    // Surface the email link in the server console so devs can click it
    console.log(`\n📧 [DEV EMAIL] To: ${to} | Subject: ${subject}`);
    const link = html.match(/href="([^"]+)"/)?.[1];
    if (link) console.log(`   Link: ${link}\n`);
  }

  return info;
}

export async function sendVerificationEmail(email: string, token: string) {
  const url = `${APP_URL}/auth/verify-email?email=${encodeURIComponent(email)}&token=${token}`;
  return send(
    email,
    "Verify your KeyCrypt email",
    `<p>Click the link below to verify your email. It expires in 24 hours.</p>
     <p><a href="${url}">${url}</a></p>`
  );
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${APP_URL}/auth/reset-password?email=${encodeURIComponent(email)}&token=${token}`;
  return send(
    email,
    "Reset your KeyCrypt password",
    `<p>Click the link below to reset your password. It expires in 1 hour.</p>
     <p><a href="${url}">${url}</a></p>
     <p>If you did not request this, ignore this email.</p>`
  );
}
