import { generateVerificationotpEmailTemplate } from "./emailTemplates.js";
import { sendEmail } from "./sendMail.js";

export async function sendVerificationCode(email, verificationCode) {
  if (!email || !verificationCode || isNaN(Number(verificationCode))) {
    throw new Error("Valid email and numeric verification code are required.");
  }

  const html = generateVerificationotpEmailTemplate(verificationCode);

  const text = `Your Judiciary of Kenya verification code is: ${verificationCode}.
This code will expire in 10 minutes.`;

  await sendEmail({
    to: email,
    subject: "Judiciary of Kenya - Verification Code",
    message: text,
    html,
  });
}
