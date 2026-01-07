require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");

const listModels = async () => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("❌ GEMINI_API_KEY not found in .env");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    const models = await ai.models.list();

    console.log("--- Available Models ---");
    models.forEach((m) => {
      console.log(
        `Name: ${m.name}, Methods: ${m.supportedGenerationMethods.join(", ")}`
      );
    });
    console.log("------------------------");
  } catch (err) {
    console.error("❌ Error listing models:", err);
  }
};

listModels();
