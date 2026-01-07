const { GoogleGenAI } = require("@google/genai");

const aiCtrl = {
  generateAIResponse: async (history, currentMessage) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return "I'm sorry, my API key is not configured. Please check the server settings.";
      }

      const ai = new GoogleGenAI({ apiKey });

      // Build context-aware prompt
      const prompt =
        history
          .map(
            (msg) =>
              `${msg.sender?.role === "ai_assistant" ? "AI" : "User"}: ${
                msg.text
              }`
          )
          .join("\n") + `\nUser: ${currentMessage}\nAI:`;

      console.log("🤖 Requesting Gemini response...");

      // List of models to try in order of preference
      // Using variety to overcome 404/429 issues on free tier
      const modelsToTry = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.0-pro",
        "gemini-2.0-flash-exp",
      ];

      for (const modelId of modelsToTry) {
        try {
          console.log(`📡 Attempting with model: ${modelId}...`);
          const result = await ai.models.generateContent({
            model: modelId,
            contents: prompt,
          });

          // Extract text response
          const responseText =
            result.text || result.candidates?.[0]?.content?.parts?.[0]?.text;

          if (responseText) {
            console.log(`✅ Success with ${modelId}`);
            return responseText;
          }
        } catch (apiErr) {
          console.warn(`⚠️ Model ${modelId} failed: ${apiErr.message}`);
          // Continue to next model in loop
          continue;
        }
      }

      return "I'm having a hard time finding a model to chat with. Please check your API key/quota.";
    } catch (err) {
      console.error("❌ Gemini SDK Error:", err.message);
      return "I'm having some trouble connecting to my brain. Please try again later.";
    }
  },
};

module.exports = aiCtrl;
