import nodemailer from "nodemailer";

/**
 * Send an email with optional CC recipients (for secondary court emails).
 * @param {Object} params
 * @param {string} params.to - Primary recipient (usually court.primaryEmail)
 * @param {string[]} [params.cc] - Optional CC recipients (court.secondaryEmails)
 * @param {string} params.subject - Subject line
 * @param {string} [params.message] - Plain text fallback
 * @param {string} [params.html] - Rich HTML content
 */
export const sendEmail = async ({ to, cc = [], subject, message, html }) => {
  if (!to || !subject || (!message && !html)) {
    throw new Error(
      "Primary recipient, subject, and either message or HTML content are required."
    );
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465, // true for port 465
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false, // Dev mode; set true in prod with valid certs
      },
    });

    const mailOptions = {
      from: `"Court Records System" <${process.env.SMTP_USER}>`,
      to, // main recipient
      cc: cc.length > 0 ? cc : undefined, // add CC if provided
      subject,
      text: message || "", // plain text fallback
      html: html || "",
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent:", info.response);
    return info;
  } catch (error) {
    console.error("❌ Email sending error:", error.message);
    throw new Error("Failed to send email. Please try again.");
  }
};
