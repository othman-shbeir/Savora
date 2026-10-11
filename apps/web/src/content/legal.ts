import type { Locale } from '@savora/shared';

// Plain-language Privacy and Terms, written from how Savora actually handles data.
// These are drafts: they must be reviewed by a lawyer for the markets Savora serves before launch,
// and LEGAL_UPDATED changed whenever the text changes.

export const LEGAL_UPDATED = '2026-10-08';

type Doc = { title: string; lead: string; updated: string; sections: Array<{ heading: string; body: string[] }> };

export const PRIVACY: Record<Locale, Doc> = {
  en: {
    title: 'Privacy',
    lead: 'Savora helps cafés and restaurants publish their menus. This page explains what we collect, why, and what we never do.',
    updated: 'Last updated {date}',
    sections: [
      {
        heading: 'Guests who open a menu',
        body: [
          'You don’t need an account and we don’t set cookies when you read a menu.',
          'We count each menu opening so the place can see when guests come. To avoid counting a reload twice we briefly use a one-way code made from your network address and browser, mixed with a secret that changes every day. We never store your address or browser details, and these short-lived records are deleted after 48 hours. What we keep is only a count per hour.',
          'If the place has a map, it loads tiles from OpenStreetMap, which sees your network address like any website you visit.',
        ],
      },
      {
        heading: 'Owners and their teams',
        body: [
          'To run your account we keep your email address, your name if you give it, your business and location details, your menus and the photos you upload.',
          'Photos are re-saved without their hidden details, including any GPS location.',
          'Signing in uses a cookie that keeps you signed in for up to 30 days. We store only a scrambled version of it. If you sign in with Google, we receive your name, email address and Google account number.',
          'For paid plans we keep your plan, invoices and payment references. Payments are made by bank transfer or cash; we never see card numbers.',
        ],
      },
      {
        heading: 'Services we use',
        body: [
          'When AI features are switched on, the menu photos you ask us to read and your requests to the Theme assistant are sent through OpenRouter to an AI model provider to process. We only use providers that do not train on this data.',
          'Address search uses OpenStreetMap’s Nominatim service with the address you type.',
          'We host our servers and database with our hosting provider and keep backups so your menu isn’t lost.',
        ],
      },
      {
        heading: 'What we never do',
        body: ['We don’t sell personal data, show advertising, or build profiles of guests.'],
      },
      {
        heading: 'Your choices',
        body: [
          'Owners can change or delete their menus, photos and locations at any time. To close your account and delete its data, contact us and we will do it within 30 days, except records we must keep by law, such as invoices.',
          'You can ask us what we hold about you, or to correct it.',
        ],
      },
    ],
  },
  ar: {
    title: 'الخصوصية',
    lead: 'تساعد سافورا المقاهي والمطاعم على نشر قوائمها. توضح هذه الصفحة ما نجمعه ولماذا، وما لا نفعله أبداً.',
    updated: 'آخر تحديث {date}',
    sections: [
      {
        heading: 'الضيوف الذين يفتحون قائمة',
        body: [
          'لا تحتاج إلى حساب، ولا نضع ملفات تعريف ارتباط عند قراءتك قائمة.',
          'نحسب كل فتح للقائمة ليعرف المكان متى يأتي الضيوف. ولكي لا تُحسب إعادة التحميل مرتين نستخدم لفترة قصيرة رمزاً أحادي الاتجاه مكوّناً من عنوان شبكتك ومتصفحك، ممزوجاً بسرّ يتغير كل يوم. لا نخزّن عنوانك ولا تفاصيل متصفحك، وتُحذف هذه السجلات القصيرة بعد 48 ساعة. ما نحتفظ به هو عدد في كل ساعة فقط.',
          'إذا كان في صفحة المكان خريطة، فهي تحمّل مربعاتها من OpenStreetMap الذي يرى عنوان شبكتك كأي موقع تزوره.',
        ],
      },
      {
        heading: 'أصحاب الأماكن وفرقهم',
        body: [
          'لتشغيل حسابك نحتفظ ببريدك الإلكتروني، واسمك إن قدّمته، وبيانات نشاطك وفروعك، وقوائمك والصور التي ترفعها.',
          'تُحفظ الصور من جديد دون بياناتها المخفية، بما فيها موقع GPS.',
          'يستخدم تسجيل الدخول ملف تعريف ارتباط يبقيك مسجلاً حتى 30 يوماً، ولا نخزّن منه إلا نسخة مشفّرة. وإذا سجلت الدخول عبر Google نتلقى اسمك وبريدك ورقم حسابك في Google.',
          'للخطط المدفوعة نحتفظ بخطتك وفواتيرك ومراجع الدفع. يتم الدفع بالتحويل البنكي أو نقداً، ولا نرى أرقام البطاقات أبداً.',
        ],
      },
      {
        heading: 'خدمات نستعين بها',
        body: [
          'عند تفعيل ميزات الذكاء الاصطناعي، تُرسل صور القوائم التي تطلب قراءتها وطلباتك لمساعد المظاهر عبر OpenRouter إلى مزوّد نماذج ذكاء اصطناعي لمعالجتها. ولا نستخدم إلا مزوّدين لا يدرّبون نماذجهم على هذه البيانات.',
          'يستخدم البحث عن العناوين خدمة Nominatim من OpenStreetMap بالعنوان الذي تكتبه.',
          'نستضيف خوادمنا وقاعدة بياناتنا لدى مزود الاستضافة، ونحتفظ بنسخ احتياطية كي لا تضيع قائمتك.',
        ],
      },
      {
        heading: 'ما لا نفعله أبداً',
        body: ['لا نبيع البيانات الشخصية، ولا نعرض إعلانات، ولا نبني ملفات عن الضيوف.'],
      },
      {
        heading: 'خياراتك',
        body: [
          'يمكن لأصحاب الأماكن تغيير قوائمهم وصورهم وفروعهم أو حذفها في أي وقت. لإغلاق حسابك وحذف بياناته، تواصل معنا وسنفعل ذلك خلال 30 يوماً، باستثناء السجلات التي يلزمنا القانون بالاحتفاظ بها مثل الفواتير.',
          'يمكنك أن تسألنا عمّا نحتفظ به عنك، أو أن تطلب تصحيحه.',
        ],
      },
    ],
  },
};

export const TERMS: Record<Locale, Doc> = {
  en: {
    title: 'Terms',
    lead: 'These terms cover using Savora to build and publish menus. By creating an account you agree to them.',
    updated: 'Last updated {date}',
    sections: [
      {
        heading: 'Your account',
        body: ['Keep access to your email address safe: it is how you sign in. You are responsible for what your team members do in your workspace.'],
      },
      {
        heading: 'Your content',
        body: [
          'Your menus, photos and brand stay yours. You give Savora permission to store them and show them to your guests, only to provide the service.',
          'Only upload what you have the right to use, and keep prices and allergen information accurate: guests rely on them.',
        ],
      },
      {
        heading: 'Plans and payment',
        body: [
          'Starter is free. Paid plans are billed monthly in US dollars, per the prices on our site when you subscribe. A plan starts when we confirm your payment and runs for a month.',
          'If a payment is late, your plan stays on for 7 more days, then moves to Starter. Nothing is deleted: features above your plan are paused until you upgrade again.',
          'You can cancel any time; your plan continues until the end of the month you paid for.',
        ],
      },
      {
        heading: 'Fair use',
        body: ['Don’t use Savora to publish anything unlawful or misleading, to attack our systems, or to collect other people’s data.'],
      },
      {
        heading: 'The service',
        body: [
          'We work to keep menus online at all times, but we can’t promise the service will never be interrupted. Keep your own copy of anything you can’t afford to lose.',
          'To the extent the law allows, Savora isn’t liable for indirect losses, and our total liability is limited to what you paid us in the last 12 months.',
        ],
      },
      {
        heading: 'Changes',
        body: ['If we change these terms in a way that matters, we will tell owners by email before the change applies.'],
      },
    ],
  },
  ar: {
    title: 'الشروط',
    lead: 'تنظم هذه الشروط استخدام سافورا لبناء القوائم ونشرها. بإنشائك حساباً فإنك توافق عليها.',
    updated: 'آخر تحديث {date}',
    sections: [
      {
        heading: 'حسابك',
        body: ['حافظ على أمان بريدك الإلكتروني، فهو وسيلة تسجيل دخولك. أنت مسؤول عمّا يفعله أعضاء فريقك في مساحة عملك.'],
      },
      {
        heading: 'محتواك',
        body: [
          'قوائمك وصورك وعلامتك تبقى ملكاً لك. وتمنح سافورا إذناً بتخزينها وعرضها لضيوفك، لتقديم الخدمة فقط.',
          'لا ترفع إلا ما يحق لك استخدامه، وحافظ على دقة الأسعار ومعلومات مسببات الحساسية، فالضيوف يعتمدون عليها.',
        ],
      },
      {
        heading: 'الخطط والدفع',
        body: [
          'خطة البداية مجانية. تُدفع الخطط المدفوعة شهرياً بالدولار الأمريكي وفق الأسعار المعروضة على موقعنا عند اشتراكك. تبدأ الخطة عندما نؤكد دفعتك وتستمر شهراً.',
          'إذا تأخرت الدفعة تبقى خطتك فعالة 7 أيام أخرى ثم تنتقل إلى خطة البداية. لا يُحذف شيء: تتوقف الميزات الأعلى من خطتك مؤقتاً حتى تقوم بالترقية مجدداً.',
          'يمكنك الإلغاء في أي وقت، وتستمر خطتك حتى نهاية الشهر الذي دفعت عنه.',
        ],
      },
      {
        heading: 'الاستخدام العادل',
        body: ['لا تستخدم سافورا لنشر أي محتوى مخالف للقانون أو مضلل، أو لمهاجمة أنظمتنا، أو لجمع بيانات الآخرين.'],
      },
      {
        heading: 'الخدمة',
        body: [
          'نعمل لإبقاء القوائم متاحة في كل الأوقات، لكن لا يمكننا أن نضمن عدم انقطاع الخدمة أبداً. احتفظ بنسختك من أي شيء لا يمكنك تحمّل فقدانه.',
          'في حدود ما يسمح به القانون، لا تتحمل سافورا مسؤولية الخسائر غير المباشرة، وتقتصر مسؤوليتنا الإجمالية على ما دفعته لنا خلال آخر 12 شهراً.',
        ],
      },
      {
        heading: 'التغييرات',
        body: ['إذا غيّرنا هذه الشروط تغييراً مهماً، سنُعلم أصحاب الأماكن بالبريد الإلكتروني قبل سريانه.'],
      },
    ],
  },
};
