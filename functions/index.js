const { onRequest } = require("firebase-functions/v2/https");

const GEMINI_API_KEY = "AIzaSyDzq_QI_4nvGaor0UZxKkyNT76j_wHvDUs";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const HOTEL_SYSTEM_PROMPT = `You are a luxury hotel concierge. The guest has contacted you through the hotel guest app.

LANGUAGE RULE: If the guest writes in Korean, respond in Korean. If in English, respond in English.

STRICT RULES:
1. NEVER say "I will check", "확인하겠습니다", "알아보겠습니다" - answer directly and helpfully
2. NEVER say you are an AI
3. Keep answers concise and practical (2-4 sentences)
4. Always offer further help at the end
5. If you don't know specific hotel details, give general luxury hotel guidance`;

async function callGemini(contents, systemInstruction) {
  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemInstruction || HOTEL_SYSTEM_PROMPT }] },
    generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
  };
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// 컨시어지 채팅
exports.geminiChat = onRequest(
  { cors: true, region: "asia-northeast3" },
  async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!message) { res.status(400).json({ error: "message required" }); return; }

      const contents = [...(history || []), { role: "user", parts: [{ text: message }] }];
      const text = await callGemini(contents, HOTEL_SYSTEM_PROMPT);
      res.json({ text });
    } catch (e) {
      console.error("Chat error:", e.message);
      res.status(500).json({ error: e.message });
    }
  }
);

// 주변 탐색
exports.geminiExplore = onRequest(
  { cors: true, region: "asia-northeast3" },
  async (req, res) => {
    try {
      const { query, hotelName, hotelAddress } = req.body;
      if (!query) { res.status(400).json({ error: "query required" }); return; }

      const hotelCtx = hotelName ? `${hotelName}${hotelAddress ? ` (${hotelAddress})` : ''}` : '럭셔리 호텔';
      const prompt = `당신은 ${hotelCtx} 전담 컨시어지입니다.
투숙객 질문: "${query}"

아래 규칙으로 답해주세요:
- 질문에서 요청한 개수만큼만 추천 (개수 언급 없으면 3개)
- 각 항목: 장소명, 도보/차량 거리, 특징 2~3문장, 영업시간 또는 예약 팁
- 마지막에 컨시어지 코멘트 1문장

한국어로 구체적이고 상세하게 작성하세요.`;

      const contents = [{ role: "user", parts: [{ text: prompt }] }];
      const text = await callGemini(contents, "당신은 5성급 호텔 컨시어지입니다. 투숙객에게 구체적인 추천을 제공하고, 각 추천마다 거리, 특징, 팁을 상세히 설명합니다.");
      res.json({ text });
    } catch (e) {
      console.error("Explore error:", e.message);
      res.status(500).json({ error: e.message });
    }
  }
);
