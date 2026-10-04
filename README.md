# JEV Decision Demo

واجهة عربية بسيطة لتجربة **TypeSafe AI JEV** كنموذج قرار احتمالي.

## الفكرة

اكتب نصًا أو موقفًا، والتطبيق يطلب من JEV اختيار قرار واحد من:

- `execute` — تنفيذ
- `review` — مراجعة بشرية
- `reject` — رفض

ويعرض أيضًا confidence واحتمالات القرارات الثلاثة.

## التشغيل

المفتاح يبقى Server-side فقط.

```env
TYPESAFE_API_KEY=your_key_here
```

الـ API المستخدم:

```
POST https://api.typesafe.ai/v1/systemone
model: jev-latest
```

## Vercel

المشروع مصمم ليعمل مباشرة على Vercel:
- `index.html` واجهة Static
- `api/decide.js` Vercel Serverless Function

لا تضع مفتاح TypeSafe داخل GitHub.


## JEV MCP for Codex

The same Vercel project now exposes a protected Streamable HTTP MCP endpoint:

```
https://jev-decision-demo.vercel.app/api/mcp
```

Authentication:

```
Authorization: Bearer <JEV_MCP_TOKEN>
```

The JEV API key remains server-side in `TYPESAFE_API_KEY` and is never returned to MCP clients.

### Tools

- `jev_decide` — choose one bounded option from explicit criteria.
- `jev_route` — choose the next agent/specialist/investigation route.
- `jev_risk` — classify an action as SAFE_AUTOMATIC, REVIEW_REQUIRED, USER_APPROVAL_REQUIRED, or BLOCK.
- `jev_approve` — completion gate: APPROVE, RETRY, or ESCALATE using acceptance criteria and evidence.

Recommended loop:

```
Codex plans -> execute -> tests/evidence -> JEV gate
                                    |-> RETRY -> Codex fixes
                                    |-> ESCALATE -> user/human
                                    `-> APPROVE -> complete
```

Environment variables:

```env
TYPESAFE_API_KEY=...
JEV_MCP_TOKEN=...
```
