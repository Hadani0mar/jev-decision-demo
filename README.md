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
