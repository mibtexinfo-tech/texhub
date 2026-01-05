
import { GoogleGenAI, Type } from "@google/genai";

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { 
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API_KEY environment variable is not set on the server." }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const { base64Data, mimeType } = await req.json();

    if (!base64Data) {
      return new Response(JSON.stringify({ error: "Missing file data" }), { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = "gemini-3-flash-preview";

    const systemInstruction = `
      You are an expert data extraction specialist for textile manufacturing "Daily RFT Reports". 
      Your task is to extract every row from the main production table and the summary performance metrics at the bottom.
      
      Extraction Rules:
      1. Table Columns: MC, Batch no., Buyer, order, Colour, COLOR GROUP (Specific column), F/Type, F.Qty, Load Cap%, Shade ok, Shade not ok, Dyeing Type, Shift Unload, Remarks.
      2. Summary Metrics (Bottom of report): 
         - Look for summary boxes for operators "YOUSUF" and "HUMAYUN".
         - Extract "TOTAL QTY (KG)" (shiftPerformance) for both.
         - Extract "TOTAL COUNT" (shiftCount - number of batches) for both.
      3. Global Metrics: Find the "BULK RFT %" and "LAB RFT %" if listed, or calculate from the "Shade ok" column for Bulk and Lab dyeing types.
      
      Strictly follow the output schema. Ensure all numeric values are numbers.
    `;

    const prompt = "Extract all machine entries from the table and the shift summary totals (Qty and Count) from the bottom boxes for Yousuf and Humayun. Ensure 'COLOR GROUP' data is captured accurately for each entry.";

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        systemInstruction,
        thinkingConfig: { thinkingBudget: 4096 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            unit: { type: Type.STRING },
            companyName: { type: Type.STRING },
            entries: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  mc: { type: Type.STRING },
                  batchNo: { type: Type.STRING },
                  buyer: { type: Type.STRING },
                  order: { type: Type.STRING },
                  colour: { type: Type.STRING },
                  colorGroup: { type: Type.STRING },
                  fType: { type: Type.STRING },
                  fQty: { type: Type.NUMBER },
                  loadCapPercent: { type: Type.NUMBER },
                  shadeOk: { type: Type.BOOLEAN },
                  shadeNotOk: { type: Type.BOOLEAN },
                  dyeingType: { type: Type.STRING },
                  shiftUnload: { type: Type.STRING },
                  remarks: { type: Type.STRING }
                },
                required: ["mc", "batchNo", "fQty"]
              }
            },
            bulkRftPercent: { type: Type.NUMBER },
            labRftPercent: { type: Type.NUMBER },
            shiftPerformance: {
              type: Type.OBJECT,
              properties: {
                yousuf: { type: Type.NUMBER },
                humayun: { type: Type.NUMBER }
              },
              required: ["yousuf", "humayun"]
            },
            shiftCount: {
              type: Type.OBJECT,
              properties: {
                yousuf: { type: Type.NUMBER },
                humayun: { type: Type.NUMBER }
              },
              required: ["yousuf", "humayun"]
            }
          },
          required: ["date", "entries", "shiftPerformance", "shiftCount"]
        },
      },
    });

    return new Response(response.text, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Netlify Function Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Extraction failed during AI processing." }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
};
