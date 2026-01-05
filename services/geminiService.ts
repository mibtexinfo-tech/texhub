
/**
 * Client-side service for extracting production data from uploaded reports.
 * This service calls Netlify functions to perform the actual AI extraction,
 * bypassing browser-side API key restrictions and ensuring security.
 */

export async function extractProductionData(base64Data: string, mimeType: string) {
  try {
    const response = await fetch('/.netlify/functions/extractProductionData', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ base64Data, mimeType }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error("Production Extraction error:", error);
    // Ensure we don't throw the "API Key browser" error by catching and re-throwing a friendly message
    if (error.message?.includes('API Key')) {
      throw new Error("System configuration error: API Key detected in browser context. Please check deployment settings.");
    }
    throw new Error(error.message || "The AI was unable to parse the production report.");
  }
}

export async function extractRFTData(base64Data: string, mimeType: string) {
  try {
    const response = await fetch('/.netlify/functions/extractRFTData', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ base64Data, mimeType }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error("RFT Extraction error:", error);
    if (error.message?.includes('API Key')) {
      throw new Error("System configuration error: API Key detected in browser context. Please check deployment settings.");
    }
    throw new Error(error.message || "The AI was unable to parse the RFT report.");
  }
}
