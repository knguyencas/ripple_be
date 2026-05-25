import nodemailer from 'nodemailer';
let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;

  const user = process.env['GMAIL_USER'];
  const pass = process.env['GMAIL_APP_PASSWORD'];

  if (!user || !pass) {
    throw new Error(
      'Email service chưa cấu hình: cần GMAIL_USER và GMAIL_APP_PASSWORD trong env'
    );
  }

  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  return cachedTransporter;
}

export async function sendPasswordResetEmail(toEmail: string, code: string) {
  const transporter = getTransporter();
  const fromAddress = process.env['GMAIL_USER'] || 'noreply@ripple.app';

  await transporter.sendMail({
    from: `"Ripple" <${fromAddress}>`,
    to: toEmail,
    subject: 'Mã xác nhận khôi phục mật khẩu Ripple',
    text: [
      'Xin chào,',
      '',
      'Bạn vừa yêu cầu khôi phục mật khẩu cho tài khoản Ripple.',
      '',
      'Mã xác nhận của bạn là:',
      '',
      `  ${code}`,
      '',
      'Mã có hiệu lực trong 60 phút.',
      '',
      'Nếu bạn không yêu cầu khôi phục, hãy bỏ qua email này — mật khẩu hiện tại vẫn an toàn.',
      '',
      'Lưu ý: PIN mã hoá nhật ký KHÔNG được reset qua email này.',
      '',
      'Ripple',
    ].join('\n'),
  });
}
