import { openai } from "@workspace/integrations-openai-ai-server";

export interface DetectionSignal {
  name: string;
  weight: number;
  description: string;
}

export interface DetectionResult {
  label: "phishing" | "suspicious" | "safe";
  riskScore: number;
  explanation: string;
  signals: string[];
  urls: string[];
}

const URGENT_PATTERNS = [
  /\b(act now|immediate action|urgent|immediately|expires today|limited time|deadline|don't delay|hurry|asap|right away|within 24 hours|within 48 hours)\b/i,
  /\b(account (will be|has been) (suspended|closed|terminated|locked|disabled))\b/i,
  /\b(verify (your|your account|immediately)|confirm (your|your account))\b/i,
];

const SENSITIVE_DATA_PATTERNS = [
  /\b(password|passcode|PIN|OTP|one-time password|security code)\b/i,
  /\b(credit card|debit card|card number|cvv|ssn|social security|bank account|routing number)\b/i,
  /\b(login credentials|username and password|enter your (details|information|credentials))\b/i,
];

const THREAT_PATTERNS = [
  /\b(your account will be|you will lose|your access will be|failure to (comply|respond|verify|confirm))\b/i,
  /\b(legal action|suspend(ed)?|terminat(ed)?|blocked|frozen)\b/i,
  /\b(you owe|payment (overdue|required|must be made)|final (notice|warning|reminder))\b/i,
];

const SUSPICIOUS_SENDER_PATTERNS = [
  /\b(no.?reply|noreply|do-not-reply)\b/i,
  /\b(support|security|admin|service|team|notification|alert)\b.*@(?!gmail\.com|yahoo\.com|outlook\.com|hotmail\.com)/i,
];

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
const SUSPICIOUS_DOMAIN_PATTERNS = [
  /bit\.ly|tinyurl|t\.co|ow\.ly|goo\.gl|buff\.ly|short\.io/i,
  /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/,
  /\.(xyz|top|click|info|link|online|site|website|space|store|club|download|stream)\b/i,
  /(paypal|amazon|google|microsoft|apple|netflix|bank|secure|account|login|verify)[^.]*\.(xyz|top|net|org|info|online|click)/i,
  /[a-z0-9-]{20,}\.(com|net|org)/i,
];

export function extractUrls(text: string): string[] {
  return [...new Set(text.match(URL_REGEX) || [])];
}

export function checkUrlSuspicion(url: string): { suspicious: boolean; reason: string } {
  for (const pattern of SUSPICIOUS_DOMAIN_PATTERNS) {
    if (pattern.test(url)) {
      if (/(bit\.ly|tinyurl|t\.co|ow\.ly|goo\.gl|buff\.ly|short\.io)/i.test(url)) {
        return { suspicious: true, reason: "URL uses a link shortener to hide the destination" };
      }
      if (/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/.test(url)) {
        return { suspicious: true, reason: "URL uses a raw IP address instead of a domain name" };
      }
      if (/\.(xyz|top|click|info|link|online|site|website|space|store|club|download|stream)\b/i.test(url)) {
        return { suspicious: true, reason: "URL uses an unusual or high-risk top-level domain" };
      }
      return { suspicious: true, reason: "URL mimics a trusted brand on a suspicious domain" };
    }
  }
  return { suspicious: false, reason: "" };
}

export function runRuleBasedDetection(content: string, sender: string | null | undefined): DetectionSignal[] {
  const signals: DetectionSignal[] = [];

  for (const pattern of URGENT_PATTERNS) {
    if (pattern.test(content)) {
      signals.push({
        name: "urgent_language",
        weight: 0.25,
        description: "Contains urgent or pressure language designed to rush the reader",
      });
      break;
    }
  }

  for (const pattern of SENSITIVE_DATA_PATTERNS) {
    if (pattern.test(content)) {
      signals.push({
        name: "sensitive_data_request",
        weight: 0.4,
        description: "Requests sensitive information such as passwords, OTPs, or financial data",
      });
      break;
    }
  }

  for (const pattern of THREAT_PATTERNS) {
    if (pattern.test(content)) {
      signals.push({
        name: "threatening_tone",
        weight: 0.3,
        description: "Contains threatening language about account suspension or legal action",
      });
      break;
    }
  }

  if (sender) {
    for (const pattern of SUSPICIOUS_SENDER_PATTERNS) {
      if (pattern.test(sender)) {
        signals.push({
          name: "suspicious_sender",
          weight: 0.2,
          description: "Sender address appears to impersonate a legitimate service",
        });
        break;
      }
    }
  }

  const urls = extractUrls(content);
  for (const url of urls) {
    const { suspicious, reason } = checkUrlSuspicion(url);
    if (suspicious) {
      signals.push({
        name: "suspicious_url",
        weight: 0.45,
        description: reason || "Contains a suspicious or deceptive URL",
      });
      break;
    }
  }

  return signals;
}

export async function analyzeWithAI(content: string, type: string, ruleSignals: DetectionSignal[]): Promise<{
  aiRiskScore: number;
  aiExplanation: string;
  additionalSignals: string[];
}> {
  const ruleContext = ruleSignals.length > 0
    ? `Rule-based pre-analysis detected these signals: ${ruleSignals.map(s => s.description).join("; ")}`
    : "Rule-based pre-analysis found no obvious signals.";

  const prompt = `You are a cybersecurity expert specializing in phishing detection. Analyze this ${type} message for phishing indicators.

Message:
"""
${content}
"""

${ruleContext}

Analyze this message and respond with JSON only (no markdown, no explanation outside JSON):
{
  "riskScore": <number 0.0 to 1.0>,
  "explanation": "<one clear sentence explaining the main risk or why it's safe>",
  "additionalSignals": ["<specific signal 1>", "<specific signal 2>"]
}

Scoring guide:
- 0.0-0.3: Safe (normal communication, no red flags)
- 0.3-0.6: Suspicious (some concerning elements but not definitively malicious)
- 0.6-1.0: Phishing (clear phishing attempt with multiple red flags)

If unsure, err on the side of marking as suspicious rather than safe. Detect subtle manipulation like fake urgency, brand impersonation, social engineering, fake rewards, and credential harvesting.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 400,
      messages: [
        {
          role: "system",
          content: "You are a cybersecurity expert. Respond only with valid JSON. Never include markdown code blocks.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      aiRiskScore: Math.min(1, Math.max(0, Number(parsed.riskScore) || 0)),
      aiExplanation: String(parsed.explanation || "Analysis complete."),
      additionalSignals: Array.isArray(parsed.additionalSignals) ? parsed.additionalSignals : [],
    };
  } catch {
    const baseScore = ruleSignals.reduce((sum, s) => sum + s.weight, 0);
    return {
      aiRiskScore: Math.min(1, baseScore),
      aiExplanation: ruleSignals.length > 0
        ? `Message contains suspicious patterns: ${ruleSignals[0].description}`
        : "No obvious phishing indicators detected.",
      additionalSignals: [],
    };
  }
}

export async function detectPhishing(
  content: string,
  type: string,
  sender?: string | null
): Promise<DetectionResult> {
  if (!content || content.trim().length === 0) {
    return {
      label: "safe",
      riskScore: 0,
      explanation: "Empty message — nothing to analyze.",
      signals: [],
      urls: [],
    };
  }

  const urls = extractUrls(content);
  const ruleSignals = runRuleBasedDetection(content, sender);
  const ruleScore = ruleSignals.reduce((sum, s) => sum + s.weight, 0);
  const normalizedRuleScore = Math.min(1, ruleScore);

  const { aiRiskScore, aiExplanation, additionalSignals } = await analyzeWithAI(content, type, ruleSignals);

  const urlSuspicious = urls.some(url => checkUrlSuspicion(url).suspicious);
  const urlBoost = urlSuspicious ? 0.15 : 0;

  const finalScore = Math.min(1, aiRiskScore * 0.65 + normalizedRuleScore * 0.25 + urlBoost * 0.1);
  const roundedScore = Math.round(finalScore * 100) / 100;

  const allSignalDescriptions = [
    ...ruleSignals.map(s => s.description),
    ...additionalSignals.filter(s => typeof s === "string" && s.length > 0),
  ];

  let label: "phishing" | "suspicious" | "safe";
  if (roundedScore >= 0.6) {
    label = "phishing";
  } else if (roundedScore >= 0.3) {
    label = "suspicious";
  } else {
    label = "safe";
  }

  return {
    label,
    riskScore: roundedScore,
    explanation: aiExplanation,
    signals: allSignalDescriptions.slice(0, 6),
    urls,
  };
}
