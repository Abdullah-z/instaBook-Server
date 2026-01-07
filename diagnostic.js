require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const https = require("https");

const callApi = (url) => {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        );
      })
      .on("error", (err) => reject(err));
  });
};

const pulseDiagnostic = async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("--- 🕵️ Gemini Deep Diagnostic ---");
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY is missing!");
    return;
  }
  console.log(`🔑 Key starts with: ${apiKey.substring(0, 4)}`);

  // 1. Test REST API (v1beta)
  console.log("\n🌐 [REST v1beta] Listing models...");
  try {
    const { status, data } = await callApi(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (status === 200) {
      console.log(
        `✅ v1beta models found: ${data.models ? data.models.length : 0}`
      );
      if (data.models)
        data.models.slice(0, 5).forEach((m) => console.log(` - ${m.name}`));
    } else {
      console.error(`❌ v1beta List failed: ${status}`);
      console.error(JSON.stringify(data));
    }
  } catch (err) {
    console.error(`❌ v1beta List Error: ${err.message}`);
  }

  // 2. Test REST API (v1)
  console.log("\n🌐 [REST v1] Listing models...");
  try {
    const { status, data } = await callApi(
      `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
    );
    if (status === 200) {
      console.log(
        `✅ v1 models found: ${data.models ? data.models.length : 0}`
      );
      if (data.models)
        data.models.slice(0, 5).forEach((m) => console.log(` - ${m.name}`));
    } else {
      console.error(`❌ v1 List failed: ${status}`);
      console.error(JSON.stringify(data));
    }
  } catch (err) {
    console.error(`❌ v1 List Error: ${err.message}`);
  }

  // 3. Test SDK Generation (gemini-1.5-flash)
  console.log(
    "\n🧪 [SDK TEST] Generating content (v1beta gemini-1.5-flash)..."
  );
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hello!");
    console.log(
      "✅ SDK Test Success:",
      result.response.text().substring(0, 20) + "..."
    );
  } catch (err) {
    console.error("❌ SDK Test Failed:", err.message);
  }
};

pulseDiagnostic();
