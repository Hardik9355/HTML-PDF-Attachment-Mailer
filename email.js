import nodemailer from "nodejs-nodemailer-outlook";
import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer-core";

export const sendEmail = async (event) => {
  const { to, cc, bcc, subject, body, attachments } = JSON.parse(event.body);

  if (!to || !subject || !body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Required fields are missing." }),
    };
  }

  try {
    let attachmentsFormatted = [];

    if (attachments) {
      for (const att of attachments) {
        // Check for valid attachment format
        if (!att.filename || typeof att.filename !== "string") {
          throw new Error("Invalid attachment filename");
        }

        if (att.url && typeof att.url === "string") {
          if (att.url.startsWith("http")) {
            attachmentsFormatted.push({
              filename: att.filename,
              path: att.url,
            });
          } else if (att.url.startsWith("data:")) {
            attachmentsFormatted.push({
              filename: att.filename,
              content: att.url.split("base64,")[1],
              encoding: "base64",
            });
          }
        } else if (att.htmlContent) {
          console.log(att.htmlContent);
          const pdfBuffer = await generatePdf(att.htmlContent);
          attachmentsFormatted.push({
            filename: att.filename || "document.pdf",
            content: pdfBuffer,
            contentType: "application/pdf",
          });
        } else {
          throw new Error("Invalid attachment format");
        }
      }
    }

    const recipientsTo = Array.isArray(to) ? to : [to];
    const recipientsCc = Array.isArray(cc) ? cc : cc ? [cc] : undefined;
    const recipientsBcc = Array.isArray(bcc) ? bcc : bcc ? [bcc] : undefined;

    await nodemailer.sendEmail({
      auth: {
        user: process.env.OUTLOOK_EMAIL,
        pass: process.env.OUTLOOK_PASSWORD,
      },
      from: process.env.OUTLOOK_EMAIL,
      to: recipientsTo,
      cc: recipientsCc,
      bcc: recipientsBcc,
      subject,
      text: body,
      html: body,
      attachments: attachmentsFormatted,
      onError: (e) => console.log(e),
      onSuccess: (i) => console.log(i),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Email sent successfully." }),
    };
  } catch (error) {
    console.error("Error sending email:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to send email.",
        error: error.message,
      }),
    };
  }
};

const generatePdf = async (html) => {
  const puppeteerConfig = {
    executablePath: await chromium.executablePath,
    headless: true,
    args: chromium.args,
    headless: chromium.headless,
  };
  const browser = await puppeteer.launch(puppeteerConfig);

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdfBuffer = await page.pdf({ format: "A4" });
  await browser.close();

  return pdfBuffer;
};
