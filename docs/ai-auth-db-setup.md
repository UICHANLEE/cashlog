# Cashlog AI/Auth/DB Setup

## Vision model strategy

Cashlog should treat OCR and object/category analysis as two layers:

1. **OCR specialist** for receipts, payment screens, and menus.
   - Recommended production track: PaddleOCR/PP-OCR lightweight server or mobile tier.
   - Reason: OCR specialists are tiny, fast, and less likely to hallucinate text.
2. **Compact VLM fallback** for normal photos and video poster frames.
   - Recommended open-weight model for a custom inference server: `Qwen2.5-VL-3B-Instruct`.
   - It is small enough to be practical, and the technical report emphasizes document parsing, object localization, and video understanding.
3. **Hosted prototype default**: `/api/analyze` currently uses OpenAI Chat Completions with `OPENAI_VISION_MODEL`, defaulting to `gpt-4o-mini`.
   - This keeps Vercel deployment simple while the app interface is being built.
   - Swap the server implementation later without changing the client contract.

The client expects this JSON contract:

```json
{
  "suggestedAmount": 5200,
  "suggestedCategory": "meal_cafe",
  "suggestedTitle": "오늘의 카페",
  "suggestedMemo": "카페 영수증으로 분류했어요.",
  "confidence": 0.88,
  "rawText": "카페 영수증 5,200원",
  "ocrText": "상호명 ... 합계 5,200",
  "detectedObjects": ["컵", "카페 영수증"],
  "categoryReason": "카페와 음료 단서가 가장 강해요.",
  "engine": "openai",
  "model": "gpt-4o-mini"
}
```

## Environment variables

```bash
VITE_PHOTO_ANALYSIS_MODE=remote
VITE_ANALYZE_API_URL=/api/analyze

# Hosted prototype
OPENAI_API_KEY=...
OPENAI_VISION_MODEL=gpt-4o-mini

# OpenAI-compatible custom VLM endpoint, e.g. vLLM/TGI/OpenRouter/HF Router
VISION_API_BASE_URL=https://your-vlm-host.example.com/v1
VISION_API_KEY=...
VISION_MODEL=Qwen/Qwen2.5-VL-3B-Instruct
VISION_ENGINE=qwen

VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

## Supabase

1. Create a Supabase project.
2. Enable email magic link auth.
3. Run `supabase/schema.sql`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

When Supabase env vars are absent, the app stays in local-only mode. When they exist, users can sign in by email and sync `cashlog_entries` with RLS-protected per-user rows.
