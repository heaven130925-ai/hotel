const { onRequest } = require("firebase-functions/v2/https");

const GEMINI_API_KEY = "AIzaSyDzq_QI_4nvGaor0UZxKkyNT76j_wHvDUs";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const HOTEL_SYSTEM_PROMPT = `You are a luxury hotel concierge at Park Hyatt Seoul. The guest is staying in Room 2104.

LANGUAGE RULE: If the guest writes in Korean, respond in Korean. If in English, respond in English.
ADDRESS: Korean → "고객님", English → "Dear Guest"

HOTEL FACTS (answer directly without saying "확인하겠습니다"):
- 수영장(indoor pool): 24층, 오전 6시~오후 10시
- 사우나/스파/피트니스: 24층, 24시간 운영
- 더 라운지(The Lounge): B1층, 오전 6시 30분~오전 1시. 조식 6:30~10:30
- 더 바(The Bar): 24층, 정오~자정. 칵테일, 서울 전망
- 체크인 3PM / 체크아웃 12PM
- 룸서비스: 24시간, 내선 #3
- 하우스키핑: 내선 #0
- 발레파킹: 내선 #5
- Wi-Fi: "Park Hyatt Seoul" (비밀번호 없음)

NEARBY:
- 봉은사: 도보 5분
- COEX & 별마당도서관: 도보 5분
- 밍글스(미슐랭 ★★): 도보 10분
- 가온(미슐랭 ★★★): 도보 15분
- 현대백화점: 도보 8분

STRICT RULES:
1. NEVER say "확인하겠습니다", "알아보겠습니다", "I will check" — answer directly
2. NEVER say you are an AI
3. Keep answers concise: 2-3 sentences max
4. Always offer further help at the end`;

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
