export function generateVerificationotpEmailTemplate(code) {
  return `
  <div style="font-family: Arial, sans-serif; background:#f9f9f9; padding:20px; border-radius:8px;">
    <!-- Header -->
    <div style="text-align:center; padding:10px 0;">
      <h2 style="color:#0a3b1f; margin:0;">Judiciary of Kenya</h2>
      <p style="color:#b48222; font-weight:bold; margin:4px 0 0 0;">Court Records System</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff; border:1px solid #e0e0e0; padding:20px; border-radius:6px; margin-top:15px;">
      <p style="font-size:16px; color:#1a1a1a;">Dear User,</p>
      <p style="font-size:16px; color:#1a1a1a;">
        Your verification code is:
      </p>

      <!-- Code Box -->
      <div style="text-align:center; margin:20px 0;">
        <span style="
          display:inline-block;
          padding:15px 30px;
          font-size:24px;
          font-weight:bold;
          background:#b48222;
          color:#ffffff;
          border-radius:6px;
          letter-spacing:3px;
        ">
          ${code}
        </span>
      </div>

      <p style="font-size:14px; color:#0a3b1f; font-weight:500;">
        ⚠️ This code will expire in 10 minutes. Please do not share it with anyone.
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align:center; margin-top:20px; font-size:12px; color:#555;">
      Judiciary of Kenya • <span style="color:#b48222;">Court Records System</span>
    </div>
  </div>
  `;
}


export function generateForgotPasswordEmailTemplate(resetPasswordUrl) {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 40px 20px; max-width: 600px; margin: auto; border-radius: 10px; color: #333;">
      <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <h2 style="color: #e74c3c; text-align: center; margin-bottom: 20px;">Reset Your Password</h2>
        <p style="font-size: 16px;">Hi there,</p>
        <p style="font-size: 16px;">We received a request to reset your password for your <strong>Blesses Hope Library Management System</strong> account. If you didn't request for this, you can safely ignore this email.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetPasswordUrl}" style="background-color: #3498db; color: white; text-decoration: none; padding: 12px 24px; font-size: 16px; border-radius: 5px;">Reset Password</a>
        </div>
        <p style="font-size: 15px;">This link is valid for <strong>15 minutes</strong>.</p>
        <p style="font-size: 15px;">If the button above doesn't work, copy and paste the following link into your browser:</p>
        <p style="word-break: break-all; font-size: 14px; color: #555;">${resetPasswordUrl}</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;" />
        <p style="font-size: 12px; color: #999; text-align: center;">This is an automated message. Please do not reply.</p>
      </div>
    </div>
  `;
}
