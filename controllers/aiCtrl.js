const { GoogleGenerativeAI } = require("@google/generative-ai");

const aiCtrl = {
  generateAIResponse: async (history, currentMessage) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return "I'm sorry, my Gemini API key is not configured. Please check the server settings.";
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Format history for @google/generative-ai
      // It expects: [{ role: "user", parts: [{ text: "..." }] }, { role: "model", parts: [{ text: "..." }] }]
      const formattedHistory = history.map((msg) => ({
        role: msg.sender?.role === "ai_assistant" ? "model" : "user",
        parts: [{ text: msg.text }],
      }));

      console.log("🤖 Requesting Gemini response (Stable SDK)...");

      const chat = model.startChat({
        history: formattedHistory,
      });

      const result = await chat.sendMessage(currentMessage);
      const response = await result.response;
      const text = response.text();

      if (text) {
        console.log("✅ Gemini success");
        return text;
      }

      return "I'm thinking, but I can't find the words right now.";
    } catch (err) {
      console.error("❌ Gemini API Error:", err.message);
      if (err.message?.includes("429")) {
        return "I'm a bit overwhelmed with requests! Please give me a minute to breathe.";
      }
      if (err.message?.includes("404")) {
        return "I'm lost. It seems this model is not available for your key right now.";
      }
      return "I'm having some trouble connecting to my brain. Please try again later.";
    }
  },
};

module.exports = aiCtrl;
