// Makeoverly in Arabic. The page is written in English; in Arabic mode this layer swaps every interface
// text it knows (exact strings, whole headings, and patterns for texts with numbers or style names),
// turns the page right to left, and keeps doing so for anything the app adds later.
// Only what people read changes: prompts sent to Gemini, saved data and downloads stay in English.
(function () {
  var STYLE_AR = { 'Modern': 'عصري', 'Scandinavian': 'اسكندنافي', 'Japandi': 'جاباندي', 'Industrial': 'صناعي', 'Classic': 'كلاسيكي', 'Boho': 'بوهو', 'Contemporary Arabic': 'عربي معاصر' };
  var ROOM_AR = { 'Living room': 'غرفة الجلوس', 'Bedroom': 'غرفة النوم', 'Majlis': 'المجلس', 'Dining room': 'غرفة السفرة', 'Kitchen': 'المطبخ', 'Home office': 'المكتب المنزلي' };
  var ROOM_LOWER = {}; Object.keys(ROOM_AR).forEach(function (k) { ROOM_LOWER[k.toLowerCase()] = ROOM_AR[k]; });
  var styleAr = function (s) { return STYLE_AR[s] || s; };
  var MARKET_AR = { 'the UAE': 'الإمارات', 'Saudi Arabia': 'السعودية', 'Kuwait': 'الكويت', 'Qatar': 'قطر', 'Bahrain': 'البحرين', 'Oman': 'عُمان', 'Jordan': 'الأردن', 'Egypt': 'مصر', 'Germany and the euro area': 'ألمانيا ومنطقة اليورو', 'the United Kingdom': 'بريطانيا', 'the United States': 'أمريكا' };
  var marketAr = function (m) { return MARKET_AR[m] || m; };
  var STYLE_RE = '(' + Object.keys(STYLE_AR).join('|') + ')';
  var ROOM_RE = '(' + Object.keys(ROOM_LOWER).join('|') + ')';

  // Whole headings with an emphasized word: matched on their full text, written as Arabic HTML
  var HTML = {
    'Love your room again.': 'حبّ غرفتك <em>من جديد.</em>',
    'Design studio': '<em>استوديو</em> التصميم',
    'Making your room 3D': 'غرفتك <em>بالـ 3D</em>',
    'Find your style': 'اكتشف <em>ستايلك</em>',
    'Family vote': '<em>تصويت</em> العيلة',
    '2D plan': 'المخطط <em>2D</em>',
    'Bill of quantities': 'جدول <em>الكميات</em>',
    'Mood & material board': '<em>مود بورد</em> وجدول المواد',
    'Your Reel': '<em>الريل</em> تبعك',
    'Sign in to Makeoverly': 'سجّل دخولك على <em>Makeoverly</em>',
    'Refine & explore': 'عدّل <em>و</em>استكشف',
    'Refine this design': 'عدّل <em>التصميم</em>',
    'See it from another angle': 'شوفه من <em>زاوية تانية</em>',
    'Shop the look': 'تسوّق <em>التصميم</em>',
    'My designs': '<em>تصاميمي</em>',
    'Your style is': 'ستايلك هو'
  };

  var T = {
    // Header, hero and steps
    'AI interior studio': 'استوديو تصميم داخلي بالذكاء الاصطناعي',
    'Take one photo, choose a style, and keep the pieces you love. See your space redesigned in about 20 seconds.': 'صوّر غرفتك، اختار ستايل، وخلّي القطع اللي بتحبها. بتشوف غرفتك متصمّمة من جديد بحوالي 20 ثانية.',
    'Redesign my room': 'صمّم غرفتي',
    'How it works': 'كيف بيشتغل',
    'Start designing': 'ابدأ التصميم',
    'No subscription': 'بدون اشتراك',
    'No sign-up': 'بدون تسجيل',
    'Keep your favourite pieces': 'خلّي قطعك المفضّلة',
    'Majlis and Arabic styles': 'مجالس وستايلات عربية',
    '7 styles to try': '7 ستايلات تجربها',
    'Upload a photo': 'ارفع صورة',
    'Any room, shot straight on in daylight.': 'أي غرفة، مصوّرة من قدّام وبضو النهار.',
    'Pick room and style': 'اختار الغرفة والستايل',
    'From Scandinavian to Contemporary Arabic.': 'من الاسكندنافي للعربي المعاصر.',
    'Keep what you love': 'خلّي اللي بتحبه',
    'Tap the pieces that should stay as they are.': 'اختار القطع اللي لازم تضل متل ما هي.',
    'Compare and save': 'قارن واحفظ',
    'Slide between before and after, then download.': 'حرّك بين قبل وبعد، وبعدين نزّل الصورة.',
    'Your photo · empty room': 'صورتك · غرفة فاضية',
    'Empty living room': 'غرفة جلوس فاضية',
    'Walls, floor and windows kept': 'الحيطان والأرضية والشبابيك ما تغيّرت',
    'Pause the demo': 'وقّف العرض',
    'Play the demo': 'شغّل العرض',
    'Demo: an empty living room with tall windows, staged by Makeoverly in Modern, Contemporary Arabic and Japandi styles while the walls, floor and windows stay the same': 'عرض: غرفة جلوس فاضية بشبابيك عالية، فرشها Makeoverly بستايل عصري وعربي معاصر وجاباندي، والحيطان والأرضية والشبابيك ما تغيّرت',
    'Sign in': 'تسجيل الدخول',
    'Sign out': 'تسجيل الخروج',
    'Settings': 'الإعدادات',
    'Close settings': 'سكّر الإعدادات',
    'Your tokens': 'توكنزاتك',

    // Studio
    'Drop your room photo here': 'حط صورة غرفتك هون',
    'or click to choose a JPG or PNG': 'أو اضغط لتختار صورة JPG أو PNG',
    'Tip: shoot the whole room from a corner, in daylight.': 'نصيحة: صوّر الغرفة كاملة من الزاوية وبضو النهار.',
    'Upload a room photo': 'ارفع صورة الغرفة',
    'Your uploaded room': 'الغرفة اللي رفعتها',
    'Your photo': 'صورتك',
    'Replace photo': 'غيّر الصورة',
    'Plan it with Noor': 'خطّط مع نور',
    'Room type': 'نوع الغرفة',
    'Style': 'الستايل',
    'Styles': 'الستايلات',
    'Not sure? Find your style in 5 swipes': 'محتار؟ اكتشف ستايلك بخمس سحبات',
    'Makeover level': 'مستوى التغيير',
    'Light refresh': 'تجديد خفيف',
    'Full makeover': 'تغيير كامل',
    'Bold & creative': 'جريء ومبدع',
    'Stage empty room': 'فرش غرفة فاضية',
    'For an empty or bare room: walls, floor and ceiling stay exactly as they are, and only furniture, rugs, lamps, art and decor are added.': 'للغرفة الفاضية: الحيطان والأرضية والسقف بيضلّوا متل ما هم، وبينضاف بس الفرش والسجاد والإضاءة واللوحات والديكور.',
    'Keep existing items': 'قطع بدك تخليها',
    'optional': 'اختياري',
    '(optional)': '(اختياري)',
    'Sofa': 'كنباية', 'Bed': 'تخت', 'Rug': 'سجادة', 'Coffee table': 'طاولة قهوة', 'Dining table': 'طاولة سفرة', 'Curtains': 'برادي',
    'Lighting': 'الإضاءة', 'Artwork': 'لوحات', 'Plants': 'نباتات', 'Fireplace': 'مدفأة', 'Wardrobe': 'خزانة', 'Desk': 'مكتب',
    'Console table': 'طاولة كونسول', 'Plant': 'نبتة', 'Lamp': 'أباجورة', 'Floor lamp': 'أباجورة أرضية', 'Table lamp': 'أباجورة طاولة', 'Side table': 'طاولة جانبية', 'Ottoman': 'بوف', 'Bench': 'بنش', 'Decor': 'ديكور', 'Pouf': 'بوف', 'Chair': 'كرسي', 'Stool': 'كرسي عالي', 'Kitchen counter': 'كاونتر المطبخ', 'Island': 'جزيرة المطبخ', 'Tv unit': 'وحدة تلفزيون', 'Nightstand': 'كومودينو', 'Cabinet': 'خزانة', 'Shelf': 'رف', 'Floor cushion': 'مخدة أرضية', 'Majlis seating': 'جلسة عربية', 'Planter': 'حوض نبات', 'Sideboard': 'بوفيه', 'TV unit': 'وحدة تلفزيون', 'Bookshelf': 'رف كتب', 'Armchair': 'كرسي', 'Cabinets': 'خزائن',
    'More options': 'خيارات أكتر',
    'Daylight': 'ضو النهار',
    'Golden hour': 'وقت الغروب',
    'Evening': 'المسا',
    'Budget': 'الميزانية',
    'Affordable': 'اقتصادي',
    'Mid-range': 'متوسط',
    'Luxury': 'فاخر',
    'Output quality': 'جودة الصورة',
    'Fast · 20–40 s': 'سريع · 20–40 ثانية',
    'HD 2K · 1–2 min': 'دقة عالية 2K · دقيقة لدقيقتين',
    'Extra notes': 'ملاحظات إضافية',
    'e.g. keep my grey sofa, add a reading corner by the window': 'مثلاً: خلّي الكنباية الرمادي، وزيد ركن قراءة جنب الشباك',
    'Generate my design': 'صمّم غرفتي',
    'Upload a photo to start': 'ارفع صورة لتبدأ',
    'Now pick a style': 'هلأ اختار ستايل',
    'Upload a photo of your room first.': 'ارفع صورة غرفتك أول.',
    'Pick a style first.': 'اختار ستايل أول.',
    'Pick at least one style to stage.': 'اختار ستايل واحد على الأقل.',
    'Please choose a JPG or PNG photo.': 'اختار صورة JPG أو PNG.',
    'Designing...': 'عم نصمّم...',
    'Designing your room...': 'عم نصمّم غرفتك...',
    'Before': 'قبل',
    'After': 'بعد',
    'Side by side': 'جنب بعض',
    'Slider': 'سلايدر',
    'How to compare': 'طريقة المقارنة',
    'Compare before and after': 'قارن قبل وبعد',
    'Your room before the makeover': 'غرفتك قبل التغيير',
    'Your room after the makeover': 'غرفتك بعد التغيير',
    'Make 3D': 'اعمل 3D',
    'Relative cost': 'الكلفة التقريبية',
    'Design actions': 'خيارات التصميم',
    'Design settings': 'إعدادات التصميم',
    'Download': 'تنزيل',
    'Download this design': 'نزّل هالتصميم',
    'Save': 'حفظ',
    'Saved': 'محفوظ',
    'Save to my designs': 'احفظ بتصاميمي',
    'New style': 'ستايل تاني',
    'Try another style': 'جرّب ستايل تاني',
    'Shop': 'تسوّق',
    'New photo': 'صورة جديدة',
    'Board': 'البورد',
    'Mood and material board': 'مود بورد وجدول المواد',
    'Reel': 'ريل',
    'Make a Reel video': 'اعمل فيديو ريل',
    'BOQ': 'الكميات',
    'Bill of quantities': 'جدول الكميات',
    'Plan': 'المخطط',
    '2D plan and DXF': 'مخطط 2D وملف DXF',
    'Design view': 'عرض التصميم',
    'Close': 'سكّر',
    'Done': 'تمام',
    'Got it': 'فهمت',
    'Try again': 'جرّب مرة تانية',
    'Back to 2D': 'رجوع للـ 2D',
    'Reset view': 'رجّع المنظر',
    'Reset the 3D view': 'رجّع منظر الـ 3D',
    'Interactive 3D model of your redesigned room': 'موديل 3D تفاعلي لغرفتك الجديدة',
    'Drag to rotate · Scroll to zoom · Right-drag to pan': 'اسحب لتدوّر · العجلة للتكبير · زر يمين لتحرّك',
    'Drag to turn · Pinch to zoom · Two fingers to pan': 'اسحب لتدوّر · قرّب بإصبعين للتكبير · إصبعين لتحرّك',
    'Drawing views of the room': 'عم نرسم الغرفة من زوايا تانية',
    'Reading the layout from all views': 'عم نقرأ ترتيب الغرفة من كل الزوايا',
    'Building the 3D room': 'عم نبني الغرفة 3D',
    'Built from these views': 'مبنية من هالزوايا',
    'Building walls, windows, furniture and lighting.': 'عم نبني الحيطان والشبابيك والفرش والإضاءة.',

    // Results, refine, angles
    'After you generate a design, refine it, see it from other angles and read the designer notes here.': 'بعد ما تصمّم، بتعدّل هون، وبتشوف التصميم من زوايا تانية، وبتقرأ ملاحظات المصمم.',
    'Designer notes': 'ملاحظات المصمم',
    'Concept': 'الفكرة', 'Palette': 'الألوان', 'Materials': 'المواد', 'Statement piece': 'القطعة المميزة', 'Budget tip': 'نصيحة للميزانية', 'Cost level': 'مستوى الكلفة',
    'Original design': 'التصميم الأصلي',
    'Type or say a change, in English or Arabic. Everything else stays as it is.': 'اكتب أو احكِ التعديل، بالعربي أو بالإنجليزي. وكل شي غيره بيضل متل ما هو.',
    'Describe a change': 'اوصف التعديل',
    'e.g. make the sofa sage green, add a large plant by the window': 'مثلاً: خلّي الكنباية زيتي وزيد نبتة كبيرة جنب الشباك',
    'Apply change': 'طبّق التعديل',
    'Applying...': 'عم نطبّق...',
    'Say the change': 'احكِ التعديل',
    'Speak instead of typing': 'احكِ بدل ما تكتب',
    'Switch to English': 'التبديل للإنجليزي',
    'Voice is Arabic. Switch to English': 'الصوت عربي. اضغط للإنجليزي',
    'Voice is English. التبديل للعربي': 'الصوت إنجليزي. اضغط للعربي',
    'Type a change first, or tap one of the ideas.': 'اكتب التعديل أول، أو اختار وحدة من الأفكار.',
    'Allow the microphone for this site in your browser, then tap the mic again.': 'اسمح للمايك لهالموقع من المتصفح، وبعدين اضغط المايك مرة تانية.',
    'I did not hear anything. Tap the mic and say the change.': 'ما سمعت شي. اضغط المايك واحكِ التعديل.',
    'Warmer lighting': 'إضاءة أدفى',
    'Lighter, brighter colors': 'ألوان أفتح',
    'Add more plants': 'زيد نباتات',
    'Change the rug': 'غيّر السجادة',
    'More luxurious finishes': 'تشطيبات أفخم',
    'Add artwork on the wall': 'حط لوحة عالحيط',
    'Cozier textiles': 'أقمشة أنعم',
    'Seasonal looks': 'زينة المواسم',
    'Ramadan': 'رمضان',
    'Eid': 'العيد',
    'Ramadan look': 'زينة رمضان',
    'Eid look': 'زينة العيد',
    'Gemini redraws this design from a new viewpoint. Small details can differ from view to view.': 'بيرسم Gemini التصميم من زاوية جديدة. ممكن تختلف تفاصيل صغيرة بين زاوية وتانية.',
    'From the doorway': 'من الباب',
    'Opposite corner': 'الزاوية المقابلة',
    'Side view': 'من الجنب',
    'Close-up detail': 'تفاصيل عن قرب',
    "Bird's-eye": 'من فوق',
    'Drawing the new angle...': 'عم نرسم الزاوية الجديدة...',

    // Shop the look
    'The main pieces in this design, with estimated prices in your currency for your budget. Each link searches real stores.': 'القطع الأساسية بالتصميم، مع أسعار تقريبية بعملتك وعلى قد ميزانيتك. كل رابط بيدوّر بمحلات حقيقية.',
    'Find the pieces': 'لاقي القطع',
    'Find again': 'دوّر مرة تانية',
    'Finding the pieces...': 'عم ندوّر على القطع...',
    'Currency': 'العملة',
    'Furniture and decor, estimated total': 'مجموع الفرش والديكور التقريبي',
    'AED · UAE dirham': 'AED · درهم إماراتي', 'SAR · Saudi riyal': 'SAR · ريال سعودي', 'KWD · Kuwaiti dinar': 'KWD · دينار كويتي', 'QAR · Qatari riyal': 'QAR · ريال قطري',
    'BHD · Bahraini dinar': 'BHD · دينار بحريني', 'OMR · Omani rial': 'OMR · ريال عماني', 'JOD · Jordanian dinar': 'JOD · دينار أردني', 'EGP · Egyptian pound': 'EGP · جنيه مصري',
    'USD · US dollar': 'USD · دولار أمريكي', 'EUR · Euro': 'EUR · يورو', 'GBP · British pound': 'GBP · جنيه إسترليني',

    // Noor
    'Noor, your AI designer': 'نور، مصممتك بالذكاء الاصطناعي',
    'Your AI designer · free, no tokens': 'مصممتك بالذكاء الاصطناعي · مجاناً، بدون توكنز',
    'I have ideas for this room. Want to hear them?': 'عندي أفكار لهالغرفة. بتحب تسمعها؟',
    'Ask Noor anything about your room': 'اسأل نور أي شي عن غرفتك',
    'Message to Noor': 'رسالة لنور',
    'Talk to Noor': 'احكِ مع نور',
    'Send': 'إرسال',
    "Read Noor's answers out loud": 'اقرأ ردود نور بصوت عالي',
    "Noor's plan is on": 'خطة نور مفعّلة',
    'Use this plan': 'استعمل هالخطة',
    'Use plan & generate': 'استعمل الخطة وصمّم',
    'Remove': 'شيل',
    'Free, no tokens': 'مجاناً، بدون توكنز',

    // Gallery
    'Show': 'اعرض',
    'All': 'الكل',
    'Favorites': 'المفضّلة',
    'Designs you generate appear here. Tap the heart to keep your favorites.': 'التصاميم اللي بتعملها بتطلع هون. اضغط القلب لتحفظ المفضّلة.',
    'Copy link to open on another device': 'انسخ الرابط لتفتحه على جهاز تاني',
    'Link copied': 'انتسخ الرابط',
    'Edit name and note': 'عدّل الاسم والملاحظة',
    'Name': 'الاسم',
    'Note': 'ملاحظة',
    'e.g. client liked the rug, check the sofa price': 'مثلاً: الزبون حب السجادة، شيّك سعر الكنباية',
    'Cancel': 'إلغاء',
    'Save changes': 'احفظ التغييرات',
    'Delete this design': 'احذف هالتصميم',
    'Remove from favorites': 'شيل من المفضّلة',
    'Add to favorites': 'زيد للمفضّلة',
    'Family vote': 'تصويت العيلة',

    // Settings, tokens, sign in
    'Your own Gemini API key': 'مفتاح Gemini تبعك',
    'Paste your Gemini API key': 'الصق مفتاح Gemini تبعك',
    'Clear': 'امسح',
    'Not needed: leave it empty to use the free designs (a daily limit applies). If you add your own key, it\'s saved only in this browser and you pay Google directly, usually a few cents per image.': 'مش ضروري: اتركه فاضي لتستعمل التصاميم المجانية (في حد يومي). إذا حطيت مفتاحك، بينحفظ بهالمتصفح بس، وبتدفع لـ Google مباشرة، عادةً كم سنت للصورة.',
    'Get a key': 'جيب مفتاح',
    "You're out of tokens": 'خلصت توكنزاتك',
    'Purchase a plan': 'اشترِ باقة',
    'More designs every month': 'تصاميم أكتر كل شهر',
    'Get 5 more free designs': 'خد 5 تصاميم مجانية كمان',
    'Sign in or sign up with Google: your account gets its own 50 tokens': 'سجّل دخول بـ Google: حسابك بياخد 50 توكن إله',
    'Each design costs 10 tokens, and tokens are only used when a design is ready. You can also add your own Gemini key in Settings.': 'كل تصميم بـ 10 توكنز، وما بتنخصم إلا لما يجهز التصميم. وفيك كمان تحط مفتاح Gemini تبعك بالإعدادات.',
    'Plans': 'الباقات',
    'Paid plans with more designs each month are coming soon. Until then, sign in with Google for 5 more free designs, or add your own Gemini key in Settings.': 'الباقات المدفوعة بتصاميم أكتر كل شهر جاية قريباً. لحد هداك الوقت، سجّل دخول بـ Google لـ 5 تصاميم مجانية كمان، أو حط مفتاح Gemini تبعك بالإعدادات.',
    'Your account gets its own 50 tokens (5 free designs) and keeps your designs on every device. The designs you made as a guest move to your account; your guest tokens stay here for when you sign out.': 'حسابك بياخد 50 توكن إله (5 تصاميم مجانية) وبيحفظ تصاميمك على كل أجهزتك. التصاميم اللي عملتها كضيف بتنتقل لحسابك، وتوكنزات الضيف بتضل هون لما تطلع من الحساب.',

    // Board, BOQ, plan, reel
    'A PDF to hand to a contractor or designer: the mood board with palette and material samples, then a coded schedule of materials, colours, furniture and lighting. Free, no tokens.': 'ملف PDF تعطيه للمقاول أو المصمم: مود بورد فيه الألوان وعينات المواد، وبعده جدول مرقّم للمواد والألوان والفرش والإضاءة. مجاناً، بدون توكنز.',
    'Preview of the mood board': 'معاينة المود بورد',
    'Reading the design...': 'عم نقرأ التصميم...',
    'Reading colours, materials and pieces from the design...': 'عم نقرأ الألوان والمواد والقطع من التصميم...',
    'Laying out the board...': 'عم نرتّب البورد...',
    'Make my board': 'اعمل البورد',
    'Download PDF': 'نزّل PDF',
    'Board as image': 'البورد كصورة',
    'Finishes and furniture quantities for this room. Measure the room and correct the sizes below: every quantity updates at once. Free, no tokens.': 'كميات التشطيبات والفرش لهالغرفة. قيس الغرفة وصحّح القياسات تحت، وكل الكميات بتتحدّث فوراً. مجاناً، بدون توكنز.',
    'Sizes from your 3D model. Check them against your own measurements.': 'القياسات من موديل الـ 3D. قارنها بقياساتك.',
    'Sizes estimated from the photo. Measure the room and correct them for accurate quantities.': 'القياسات تقديرية من الصورة. قيس الغرفة وصحّحها لتطلع الكميات دقيقة.',
    'Room (m)': 'الغرفة (متر)',
    'Width': 'العرض', 'Depth': 'العمق', 'Height': 'الارتفاع',
    'Doors': 'الأبواب', 'Windows': 'الشبابيك', 'How many': 'كم واحد',
    'Measuring the room from the photo...': 'عم نقيس الغرفة من الصورة...',
    'Could not measure the photo, so standard sizes are shown. Type your room sizes.': 'ما قدرنا نقيس من الصورة، فحطينا قياسات عادية. اكتب قياسات غرفتك.',
    'Code': 'الرمز', 'Item': 'البند', 'Unit': 'الوحدة', 'Qty': 'الكمية', 'Rate': 'سعر الوحدة', 'Amount': 'المبلغ',
    'Floors': 'الأرضيات', 'Walls & ceiling': 'الحيطان والسقف', 'Furniture & decor': 'الفرش والديكور',
    'Floor finish': 'تشطيب الأرضية', 'Skirting': 'النعلات', 'Matching the floor or joinery': 'متل الأرضية أو النجارة',
    'Wall finish, net area': 'تشطيب الحيطان، المساحة الصافية', 'Paint as palette': 'دهان حسب الألوان',
    'Wall paint, 2 coats': 'دهان الحيطان، وجهين', 'Wall primer, 1 coat': 'برايمر الحيطان، وجه واحد', 'Ceiling paint, 2 coats': 'دهان السقف، وجهين',
    'At 10 m² per litre': 'كل لتر بيغطي 10 م²', 'At 12 m² per litre': 'كل لتر بيغطي 12 م²',
    'Curtain track': 'سكة البرادي', 'Curtain fabric, 2× fullness': 'قماش البرادي، كثافة مضاعفة',
    'Value engineering: ways to save': 'هندسة القيمة: طرق للتوفير',
    'Download for Excel': 'نزّل لـ Excel',
    'Price it': 'سعّر',
    'Quantities include 10% waste for flooring and 5% for skirting. Paint: 2 coats at 10 m² per litre, primer at 12 m² per litre. Rates are estimates; get quotes before ordering.': 'الكميات فيها 10% هدر للأرضية و5% للنعلات. الدهان: وجهين، كل لتر لـ 10 م²، والبرايمر كل لتر لـ 12 م². الأسعار تقديرية، خود عروض أسعار قبل ما تطلب.',
    'A dimensioned floor plan of this design, ready to open in AutoCAD as a DXF (millimetres, with layers). Free, no tokens.': 'مخطط أرضي بالقياسات لهالتصميم، جاهز يفتح على أوتوكاد كملف DXF (بالمليمتر ومع طبقات). مجاناً، بدون توكنز.',
    'Drawn from your 3D model.': 'مرسوم من موديل الـ 3D تبعك.',
    'Measured from the design photo. Build the 3D model first for a more accurate plan.': 'مقاس من صورة التصميم. اعمل موديل 3D أول لمخطط أدق.',
    'Measuring the room and placing the furniture...': 'عم نقيس الغرفة ونرتّب الفرش...',
    'Floor plan preview': 'معاينة المخطط',
    'Download DXF': 'نزّل DXF',
    'Plan as SVG': 'المخطط كـ SVG',
    'An AI estimate of the room from the design. Check every dimension on site before using it for construction.': 'تقدير بالذكاء الاصطناعي للغرفة من التصميم. تأكد من كل قياس بالموقع قبل ما تستعمله بالتنفيذ.',
    'A vertical before and after video for Instagram Reels, TikTok and Stories. Free, no tokens.': 'فيديو بالطول قبل وبعد لريلز إنستغرام وتيك توك والستوري. مجاناً، بدون توكنز.',
    'Make my Reel': 'اعمل الريل',
    'Download video': 'نزّل الفيديو',
    'Share': 'شارك',
    'Preparing...': 'عم نجهّز...',
    'Recording...': 'عم نسجّل...',
    'This browser cannot record video. Please use a recent Chrome, Edge or Safari.': 'هالمتصفح ما بيقدر يسجّل فيديو. استعمل Chrome أو Edge أو Safari حديث.',

    // Quiz and family vote
    'Five rooms. Swipe right if you love it, left if it\'s not you.': 'خمس غرف. اسحب يمين إذا حبيتها، ويسار إذا مش ذوقك.',
    'Love it': 'حبيتها',
    'Not for me': 'مش ذوقي',
    'Retake': 'عيد الاختبار',
    'LOVE': 'حبيتها',
    'NOPE': 'لأ',
    'Nothing felt quite right, so this is the closest match. Noor can help you find a look that is truly yours.': 'ما في شي عجبك كتير، فهاد الأقرب لذوقك. نور بتقدر تساعدك تلاقي ستايل بيشبهك.',
    'Choose 2 to 6 designs and send the link to your family. Each person taps the heart on their favourite; no sign-up needed.': 'اختار من 2 لـ 6 تصاميم وابعت الرابط للعيلة. كل واحد بيضغط قلب على اللي عجبه، بدون تسجيل.',
    'Question': 'السؤال',
    'Create the link': 'اعمل الرابط',
    'Your vote is ready. Send this link:': 'التصويت جاهز. ابعت هالرابط:',
    'Vote link': 'رابط التصويت',
    'Copy': 'نسخ',
    'Copied': 'انتسخ',
    'Send on WhatsApp': 'ابعت على واتساب',
    'See results': 'شوف النتيجة',
    'Your votes': 'تصويتاتك',
    'Results': 'النتيجة',
    'Copy link': 'انسخ الرابط',
    'Delete': 'احذف',
    'Could not reach Makeoverly. Check your connection; if you use an ad blocker, allow this site and try again.': 'ما قدرنا نوصل لـ Makeoverly. شيّك الإنترنت، وإذا عندك مانع إعلانات اسمح لهالموقع وجرّب مرة تانية.',

    // Studio footer and misc
    'My designs': 'تصاميمي',
    'Very low cost': 'كلفة قليلة كتير', 'Low cost': 'كلفة قليلة', 'Mid-range cost': 'كلفة متوسطة', 'High cost': 'كلفة عالية', 'Luxury cost': 'كلفة فاخرة',
    'Very low cost:': 'كلفة قليلة كتير:', 'Low cost:': 'كلفة قليلة:', 'Mid-range cost:': 'كلفة متوسطة:', 'High cost:': 'كلفة عالية:', 'Luxury cost:': 'كلفة فاخرة:',
    'Virtual staging': 'فرش الشقق الفاضية',
    'Style quiz': 'اختبار الستايل',
    'Reels': 'ريلز',
    'Mood board PDF': 'مود بورد PDF',
    '2D plan DXF': 'مخطط DXF',
    'Arabic & voice editing': 'التعديل بالعربي وبالصوت',
    'Ramadan & Eid looks': 'زينة رمضان والعيد',
    'AI estimate from the design. Verify all dimensions on site.': 'تقدير بالذكاء الاصطناعي. تأكد من كل القياسات بالموقع.',
    'Say your name': 'احكِ اسمك',
    'Redesigning...': 'عم نصمّم من جديد...',
    '3D model': 'موديل 3D',
    'Redesign your room in 20 seconds': 'صمّم غرفتك من جديد بـ 20 ثانية',
    'Built by Group 36, Outskill AI Accelerator': 'من تطوير Group 36، Outskill AI Accelerator',
    'Language': 'اللغة'
  };

  // Texts with numbers or names in them
  // The quiz shows a style's concept as its description
  var CONCEPT_AR = {
    'Quiet gallery-like modern living with crisp architecture and one sculptural moment': 'بيت عصري هادي متل المعرض، بخطوط معمارية واضحة وقطعة فنية وحدة لافتة',
    'Bright, cosy hygge home that feels calm, functional and full of daylight': 'بيت مضوّي ودافي، هادي وعملي ومليان ضو النهار',
    'Serene wabi-sabi retreat balancing Japanese restraint and Scandinavian warmth': 'ملجأ هادي بيجمع بساطة الياباني ودفا الاسكندنافي',
    'Refined loft with raw materials softened by warm leather and wood': 'لوفت أنيق بمواد خام، بيلطّفها الجلد والخشب الدافي',
    'Timeless elegance with symmetry, fine craftsmanship and a modern lightness': 'أناقة ما بتنتهي، بتناسق وحرفية عالية ولمسة عصرية خفيفة',
    'Free-spirited, sun-warmed home layered with craft, travel finds and greenery': 'بيت حر ودافي، مليان أشغال يدوية وقطع من السفر ونباتات',
    'Contemporary Middle Eastern hospitality, calm and generous, with heritage geometry': 'ضيافة شرقية معاصرة، هادية وكريمة، بنقوش هندسية من التراث'
  };
  var P = [
    [new RegExp('^(' + Object.keys(CONCEPT_AR).join('|') + ')\\.(?: With a touch of ' + STYLE_RE + '\\.)?$'), function (m, c, s) { return CONCEPT_AR[c] + '.' + (s ? ' مع لمسة ' + styleAr(s) + '.' : ''); }],
    [new RegExp('^' + STYLE_RE + ' · (Living room|Bedroom|Majlis|Dining room|Kitchen|Home office) · (.+?)( ·)?$'), function (m, s, r, d, dot) { return styleAr(s) + ' · ' + ROOM_AR[r] + ' · ' + d + (dot ? ' ·' : ''); }],
    [new RegExp('^' + STYLE_RE + ' ' + ROOM_RE + ' · (.+)$'), function (m, s, r, rest) { return ROOM_LOWER[r] + ' · ' + styleAr(s) + ' · ' + ({ staged: 'مفروشة', 'Ramadan look': 'زينة رمضان', 'Eid look': 'زينة العيد' }[rest] || T[rest] || rest); }],
    [/^(LIVING ROOM|BEDROOM|MAJLIS|DINING ROOM|KITCHEN|HOME OFFICE)$/, function (m, r) { return ROOM_AR[r.charAt(0) + r.slice(1).toLowerCase()]; }],
    [/^OPENING (\d+)$/, 'فتحة $1'],
    [/^W (\d+)$/, 'شباك $1'],
    [/^D (\d+)$/, 'باب $1'],
    [/^([\d.]+) m² {1,2}· {1,2}ceiling (\d+)$/, 'المساحة $1 م² · السقف $2'],
    [/^(\d+) of (\d+) styles ready\.\.\.$/, '$1 من $2 ستايلات جاهزة...'],
    [/^Staging (\d+) styles\.\.\.$/, 'عم نفرّش بـ $1 ستايلات...'],
    [new RegExp('^Staging in ' + STYLE_RE + '\\.\\.\\.$'), function (m, s) { return 'عم نفرّش بستايل ' + styleAr(s) + '...'; }],
    [new RegExp('^Staged · ' + STYLE_RE + '$'), function (m, s) { return 'جاهزة · ' + styleAr(s); }],
    [new RegExp('^After · ' + STYLE_RE + '$'), function (m, s) { return 'بعد · ' + styleAr(s); }],
    [new RegExp('^(\\d+)\\. ' + STYLE_RE + '$'), function (m, n, s) { return n + '. ' + styleAr(s); }],
    [/^(\d+)\. Original design$/, '$1. التصميم الأصلي'],
    [/^(\d+)\. Ramadan look$/, '$1. زينة رمضان'],
    [/^(\d+)\. Eid look$/, '$1. زينة العيد'],
    [new RegExp('^' + STYLE_RE + ' ' + ROOM_RE + '$'), function (m, s, r) { return ROOM_LOWER[r] + ' · ' + styleAr(s); }],
    [new RegExp('^Design in ' + STYLE_RE + '$'), function (m, s) { return 'صمّم بستايل ' + styleAr(s); }],
    [/^Recording your Reel\.\.\. (\d+)s$/, 'عم نسجّل الريل... $1 ث'],
    [/^(\d+) tokens?$/, '$1 توكن'],
    [/^(\d+) tokens left · (\d+) designs?$/, 'باقي $1 توكن · $2 تصاميم'],
    [/^(\d+) designs? left · (\d+) tokens per design$/, 'باقي $1 تصاميم · $2 توكنز للتصميم'],
    [/^Takes about 20 to 40 seconds · (\d+) tokens per design, (\d+) tokens left$/, 'بياخد 20 لـ 40 ثانية · $1 توكنز للتصميم، باقي $2 توكن'],
    [/^HD takes about 1 to 2 minutes · (\d+) tokens per design, (\d+) tokens left$/, 'الدقة العالية بتاخد دقيقة لدقيقتين · $1 توكنز للتصميم، باقي $2 توكن'],
    [/^You have (\d+) tokens, enough for (\d+) more designs\. Each design costs (\d+) tokens\.$/, 'معك $1 توكن، بيكفّوا لـ $2 تصاميم كمان. كل تصميم بـ $3 توكنز.'],
    [/^Each design costs (\d+) tokens and you have (\d+) tokens? left\. Choose how to keep designing:$/, 'كل تصميم بـ $1 توكنز، وباقيلك $2 توكن. اختار كيف بدك تكمّل:'],
    [/^(\d+) designs? · (\d+) favorites? · (online|in this browser|on every device)$/, function (m, d, f, w) { return d + ' تصاميم · ' + f + ' مفضّلة · ' + ({ online: 'أونلاين', 'in this browser': 'بهالمتصفح', 'on every device': 'على كل أجهزتك' })[w]; }],
    [/^(\d+) of 6 chosen( · choose at least 2)?$/, function (m, n, more) { return 'اخترت ' + n + ' من 6' + (more ? ' · اختار 2 على الأقل' : ''); }],
    [/^Room (\d+) of (\d+)$/, 'الغرفة $1 من $2'],
    [/^Price it in ([A-Z]{3})$/, 'سعّر بالـ $1'],
    [/^Re-price in ([A-Z]{3})$/, 'عيد التسعير بالـ $1'],
    [/^Estimated total, supply and install \(([A-Z]{3})\)$/, 'المجموع التقديري، توريد وتركيب ($1)'],
    [/^Pricing for (.+)\.\.\.$/, function (m, k) { return 'عم نسعّر لسوق ' + marketAr(k) + '...'; }],
    [/^Prices are estimates for typical stores in (.+) at your budget level; check the store for the exact price\.$/, function (m, k) { return 'الأسعار تقديرية لمحلات ' + marketAr(k) + ' حسب ميزانيتك، شيّك المحل للسعر الدقيق.'; }],
    [/^pick up to (\d+), all made at once$/, 'اختار لحد $1، وبيتعملوا مرة وحدة'],
    [/^pick up to (\d+), (\d+) tokens each$/, 'اختار لحد $1، كل واحد بـ $2 توكنز'],
    [/^Drop ([\d.]+) m$/, 'الطول $1 م'],
    [/^([\d.]+) m² \+ 10% waste$/, '$1 م² + 10% هدر'],
    [/^([\d.]+) m \+ 5% waste$/, '$1 م + 5% هدر'],
    [/^([\d.]+) m² ceiling$/, 'سقف $1 م²'],
    [/^([\d.]+) m × ([\d.]+) m − doors and windows$/, '$1 م × $2 م − الأبواب والشبابيك'],
    [/^These styles did not finish: (.+?)\. (.*) Pick just those styles and press the button again\.$/, 'هالستايلات ما خلصت: $1. $2 اختارهم لحالهم واضغط الزر مرة تانية.'],
    [/^Staging (\d+) styles uses (\d+) tokens and you have (\d+)\. Pick (\d+) or fewer, or add your own Gemini key in Settings\.$/, 'فرش $1 ستايلات بياخد $2 توكن ومعك $3. اختار $4 أو أقل، أو حط مفتاح Gemini تبعك بالإعدادات.'],
    [/^You can stage up to (\d+) styles at once\. Tap a selected style to remove it first\.$/, 'فيك تفرّش لحد $1 ستايلات مرة وحدة. اضغط على ستايل مختار لتشيله أول.']
  ];

  var LANG_KEY = 'makeover-ui-lang';
  var lang = 'en';
  try { lang = localStorage.getItem(LANG_KEY) || (/^ar/i.test(navigator.language || '') ? 'ar' : 'en'); } catch (e) {}

  function norm(t) { return String(t).replace(/\s+/g, ' ').trim(); }
  function translate(t) {
    var k = norm(t);
    if (!k || !/[A-Za-z]/.test(k)) return null;
    if (T.hasOwnProperty(k)) return T[k];
    if (STYLE_AR[k]) return STYLE_AR[k];
    if (ROOM_AR[k]) return ROOM_AR[k];
    for (var i = 0; i < P.length; i++) if (P[i][0].test(k)) return k.replace(P[i][0], P[i][1]);
    return null;
  }

  // Each translated node remembers its English, so switching back restores it exactly
  var textOrig = new WeakMap(), attrOrig = new WeakMap(), htmlOrig = new WeakMap();
  // What this layer itself wrote, so its own writes are not mistaken for the app changing a text
  var textMine = new WeakMap(), attrMine = new WeakMap(), htmlMine = new WeakMap();
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  var SKIP = 'script, style, textarea, .logo, [data-no-i18n], #demoCap, #demoEnd';

  function skipped(el) { return el && el.closest && el.closest(SKIP); }
  function doText(n) {
    if (skipped(n.parentNode)) return;
    var cur = n.nodeValue;
    if (lang === 'ar') {
      var tr = translate(cur);
      if (tr != null && tr !== norm(cur)) {
        textOrig.set(n, cur);
        n.nodeValue = cur.replace(norm(cur), tr);
        textMine.set(n, n.nodeValue);
      }
    } else if (textOrig.has(n)) { n.nodeValue = textOrig.get(n); textOrig.delete(n); }
  }
  function doAttrs(el) {
    if (skipped(el)) return;
    var saved = attrOrig.get(el) || {};
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute || !el.hasAttribute(a)) return;
      if (lang === 'ar') {
        var v = el.getAttribute(a), tr = translate(v);
        if (tr != null && tr !== v) {
          saved[a] = v; el.setAttribute(a, tr);
          var mine = attrMine.get(el) || {}; mine[a] = tr; attrMine.set(el, mine);
        }
      } else if (saved[a] != null) { el.setAttribute(a, saved[a]); delete saved[a]; }
    });
    attrOrig.set(el, saved);
  }
  function doHeading(el) {
    if (lang === 'ar') {
      var k = norm(el.textContent);
      if (HTML[k]) { htmlOrig.set(el, el.innerHTML); el.innerHTML = HTML[k]; htmlMine.set(el, el.innerHTML); return true; }
    } else if (htmlOrig.has(el)) { el.innerHTML = htmlOrig.get(el); htmlOrig.delete(el); return true; }
    return htmlOrig.has(el);
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 || skipped(root)) return;
    if (/^H[1-4]$/.test(root.tagName) && doHeading(root)) return;
    doAttrs(root);
    for (var c = root.firstChild; c; c = c.nextSibling) walk(c);
  }

  var busy = false;
  var observer = new MutationObserver(function (ms) {
    if (busy || lang !== 'ar') return;
    busy = true;
    ms.forEach(function (m) {
      var t = m.target;
      if (m.type === 'characterData') {
        if (textMine.get(t) === t.nodeValue) return;
        textOrig.delete(t); textMine.delete(t);
        doText(t);
      } else if (m.type === 'attributes') {
        var mine = attrMine.get(t) || {};
        if (mine[m.attributeName] === t.getAttribute(m.attributeName)) return;
        var s = attrOrig.get(t); if (s) delete s[m.attributeName];
        delete mine[m.attributeName];
        doAttrs(t);
      } else m.addedNodes.forEach(walk);
      // A heading whose text the app rewrote is translated again as a whole
      var h = (t.nodeType === 1 ? t : t.parentNode);
      h = h && h.closest && h.closest('h1, h2, h3, h4');
      if (h && htmlMine.get(h) !== h.innerHTML) { htmlOrig.delete(h); htmlMine.delete(h); doHeading(h); }
    });
    busy = false;
  });

  function apply() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    busy = true;
    walk(document.body);
    busy = false;
    var b = document.getElementById('langSwitch');
    if (b) { b.textContent = lang === 'ar' ? 'EN' : 'ع'; b.title = lang === 'ar' ? 'Switch to English' : 'التبديل للعربي'; b.setAttribute('aria-label', b.title); }
  }
  window.makeoverLang = function () { return lang; };
  window.makeoverTranslate = translate;
  window.setMakeoverLang = function (l) {
    lang = l === 'ar' ? 'ar' : 'en';
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    apply();
    // The voice and Refine language follow the page language
    if (typeof window.setNoorLang === 'function') window.setNoorLang(lang);
  };
  window.initMakeoverLang = function () {
    var b = document.getElementById('langSwitch');
    if (b) b.addEventListener('click', function () { window.setMakeoverLang(lang === 'ar' ? 'en' : 'ar'); });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    apply();
    if (lang === 'ar' && typeof window.setNoorLang === 'function') window.setNoorLang('ar');
  };
})();
