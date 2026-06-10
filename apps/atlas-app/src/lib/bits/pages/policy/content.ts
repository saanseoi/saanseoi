import type { PolicyDocument } from './types'

export const privacyPolicy: PolicyDocument = {
  title: 'Privacy Policy',
  chineseTitle: '私隱政策',
  version: '1',
  effectiveDate: '10 June 2026',
  contactEmail: 'policy@saanseoi.hk',
  englishIntro: [
    'Saanseoi (山水 - "saanseoi.hk") is a citizen initiative based in Hong Kong SAR. We build civic technology that makes open data more accessible to the public, researchers, developers, and advocacy groups. We take your privacy seriously and want to be straightforward about how we handle personal information.',
    'This policy is written to comply with the Personal Data (Privacy) Ordinance (Cap. 486, PDPO) of Hong Kong SAR.',
  ],
  chineseIntro: [
    '山水（saanseoi.hk）是一個立足於香港特別行政區的公民自發項目，致力以科技推動開放數據的普及，服務市民、研究人員、開發者及倡議團體。我們認真對待你的私隱，並希望坦誠說明我們如何處理個人資料。',
    '本政策依據香港特別行政區《個人資料（私隱）條例》（第486章，下稱「私隱條例」）制訂。',
  ],
  englishSections: [
    {
      heading: '1. What data we collect',
      bullets: [
        'Email address - when you subscribe to our informational updates.',
        'Email address or OAuth identity (e.g. via GitHub or Google) - when you register for our API portal.',
        'Server logs and Cloudflare Analytics data - including IP addresses, request paths, timestamps, browser/client information, and referrer URLs. This is collected automatically when you visit our website or use our APIs.',
        'We do not collect names, phone numbers, payment details, or any sensitive personal data as defined under the PDPO.',
      ],
    },
    {
      heading: '2. Why we collect it',
      bullets: [
        "Mailing list email addresses are used solely to send informational updates about Saanseoi's work. We will never sell, rent, or share these with third parties except where strictly necessary to deliver those communications (e.g. our email dispatch provider).",
        'API portal credentials (email or OAuth) are used purely to authenticate your access to our API services. They are not used for any other purpose.',
        'Server logs and analytics help us understand how our services are used, identify technical issues, and protect the platform from abuse or degraded performance.',
      ],
    },
    {
      heading: '3. Legal basis and data protection principles',
      paragraphs: [
        'In handling your personal data, we follow the six data protection principles under the PDPO:',
      ],
      bullets: [
        'We collect data for a lawful, directly related purpose and tell you about it.',
        'We use data only for the purpose for which it was collected.',
        'We do not hold data longer than necessary.',
        'We take reasonable steps to keep data accurate.',
        'We apply appropriate security measures to protect data.',
        'You have the right to access and correct data we hold about you.',
      ],
    },
    {
      heading: '4. Data sharing',
      paragraphs: [
        'We do not sell or share your personal data with third parties for commercial purposes. Limited sharing may occur with:',
      ],
      bullets: [
        'Email delivery providers, solely to send informational communications you have opted into.',
        "Cloudflare, which processes analytics and network data as part of delivering and protecting our service. Cloudflare's privacy practices are governed by their own policies.",
        'Law enforcement or regulators, only if required by applicable Hong Kong law.',
      ],
    },
    {
      heading: '5. Data retention',
      paragraphs: [
        'We retain personal data only as long as necessary for the purpose for which it was collected. Mailing list addresses are held until you unsubscribe. API portal credentials are held until you request account deletion. Server logs are retained for a limited operational period.',
      ],
    },
    {
      heading: '6. Your rights',
      paragraphs: ['Under the PDPO, you have the right to:'],
      bullets: [
        'Request access to personal data we hold about you.',
        'Request correction of inaccurate data.',
        'Request deletion of your account and associated personal data.',
        'To exercise any of these rights, please contact us at policy@saanseoi.hk. We will respond within a reasonable time.',
      ],
    },
    {
      heading: '7. Cookies and analytics',
      paragraphs: [
        'We use Cloudflare Analytics, which is a privacy-friendly analytics solution that does not use cookies to track individual users across the web. Our server logs may capture technical request data as described above.',
      ],
    },
    {
      heading: '8. Changes to this policy',
      paragraphs: [
        'If we make material changes to this policy, we will notify registered users by email before the changes take effect. The current version is always published at saanseoi.hk.',
      ],
    },
    {
      heading: '9. Contact',
      paragraphs: [
        'If you have any questions or concerns about your privacy, please write to us at policy@saanseoi.hk. We are a citizen initiative and we genuinely welcome your feedback.',
      ],
    },
  ],
  chineseSections: [
    {
      heading: '一、我們收集的資料',
      bullets: [
        '電郵地址 - 當你訂閱我們的資訊更新時。',
        '電郵地址或 OAuth 身份（如 GitHub 或 Google）- 當你註冊 API 平台時。',
        '伺服器日誌及 Cloudflare Analytics 數據 - 包括 IP 地址、請求路徑、時間戳記、瀏覽器/客戶端資訊及來源網址。當你瀏覽本網站或使用 API 時，此類資料會自動收集。',
        '我們不收集姓名、電話號碼、付款資料，或私隱條例下定義的任何敏感個人資料。',
      ],
    },
    {
      heading: '二、我們為何收集資料',
      bullets: [
        '郵件訂閱的電郵地址僅用於發送有關山水工作的資訊更新。我們絕不向第三方出售、出租或分享這些地址，除非為發送上述通訊而有必要（例如我們的電郵發送服務商）。',
        'API 平台登入憑證（電郵或 OAuth）純粹用於驗證你對 API 服務的存取，不作其他用途。',
        '伺服器日誌及分析數據協助我們了解服務使用情況、識別技術問題，並保護平台免受濫用或服務降級。',
      ],
    },
    {
      heading: '三、法律依據及資料保護原則',
      paragraphs: ['在處理個人資料時，我們遵守私隱條例訂明的六項保障資料原則：'],
      bullets: [
        '為合法的直接相關目的收集資料，並告知當事人。',
        '只將資料用於收集時所述的目的。',
        '不超出必要期限保存資料。',
        '採取合理步驟確保資料準確。',
        '採用適當的安全措施保護資料。',
        '你有權查閱及更正我們持有的你的個人資料。',
      ],
    },
    {
      heading: '四、資料共享',
      paragraphs: [
        '我們不會為商業目的出售或分享你的個人資料。以下情況可能涉及有限度的共享：',
      ],
      bullets: [
        '電郵發送服務商，僅用於發送你已選擇訂閱的資訊通訊。',
        'Cloudflare，作為提供及保護我們服務的一部分處理分析及網絡數據。Cloudflare 的私隱慣例受其本身政策規管。',
        '執法機關或監管機構，僅在香港適用法律要求的情況下。',
      ],
    },
    {
      heading: '五、資料保留',
      paragraphs: [
        '我們只在實現收集目的所需的期限內保留個人資料。訂閱電郵地址保留至你取消訂閱為止；API 平台登入憑證保留至你要求刪除帳戶為止；伺服器日誌保留有限的運營期限。',
      ],
    },
    {
      heading: '六、你的權利',
      paragraphs: ['根據私隱條例，你有權：'],
      bullets: [
        '要求查閱我們持有的你的個人資料。',
        '要求更正不準確的資料。',
        '要求刪除你的帳戶及相關個人資料。',
        '如欲行使以上任何權利，請電郵 policy@saanseoi.hk 聯絡我們，我們將在合理時間內回覆。',
      ],
    },
    {
      heading: '七、Cookies 及分析',
      paragraphs: [
        '我們使用 Cloudflare Analytics，這是一個不使用 cookies 跨網站追蹤個別用戶的私隱友好型分析方案。我們的伺服器日誌可能如上所述記錄技術請求資料。',
      ],
    },
    {
      heading: '八、政策更新',
      paragraphs: [
        '如我們對本政策作出重大更改，我們將在更改生效前以電郵通知已登記用戶。最新版本將持續於 saanseoi.hk 發布。',
      ],
    },
    {
      heading: '九、聯絡我們',
      paragraphs: [
        '如對你的私隱有任何疑問或關切，歡迎電郵 policy@saanseoi.hk 聯絡我們。我們是公民自發項目，真誠歡迎你的意見。',
      ],
    },
  ],
}

export const termsPolicy: PolicyDocument = {
  title: 'Terms of Service',
  chineseTitle: '服務條款',
  version: '1',
  effectiveDate: '10 June 2026',
  contactEmail: 'policy@saanseoi.hk',
  englishIntro: [
    'Welcome to Saanseoi (山水 - saanseoi.hk). We are a citizen initiative in Hong Kong SAR that packages open datasets and serves them via public APIs. By using our website, APIs, or any related services, you agree to these terms. We have written them to be as clear as possible - please read them.',
  ],
  chineseIntro: [
    '歡迎使用山水（saanseoi.hk）。我們是一個立足於香港特別行政區的公民自發項目，將開放數據集打包並透過公開 API 提供。使用本網站、API 或任何相關服務，即代表你同意以下條款。我們盡力以清晰的語言寫就，請細閱。',
  ],
  englishSections: [
    {
      heading: '1. About our service',
      paragraphs: [
        'Saanseoi aggregates publicly available open datasets and provides them through APIs and a web platform, free of charge, on a best-effort basis. Our goal is to make civic data more useful and accessible for everyone.',
      ],
    },
    {
      heading: '2. Free access and fair use',
      paragraphs: [
        'Our APIs and data are provided free of charge. In return, we ask that you use the service fairly and responsibly. If your usage places unreasonable demands on our infrastructure - for example, through excessive automated requests - we may take the following steps:',
      ],
      bullets: [
        'Throttle your traffic to protect service quality for all users.',
        'Contact you to discuss and resolve the issue.',
        'Temporarily or permanently block your access if the demands risk degrading the service for other users.',
        'We will always try to contact you before taking restrictive action, and we welcome conversation about high-volume or research use cases.',
      ],
    },
    {
      heading: '3. Data and licensing',
      paragraphs: [
        'Data available through our APIs is sourced from upstream open datasets. Each dataset is offered under its original upstream licence. Where no licence is specified by the upstream source, data is offered under the Open Data Commons Attribution Licence (ODC-By), as published at https://opendatacommons.org/licenses/by/',
        'Licence information is displayed alongside each dataset. It is your responsibility to review and comply with the applicable licence for any data you use. Saanseoi does not grant any additional rights beyond those provided by the upstream licence.',
      ],
    },
    {
      heading: '4. No warranties on data quality',
      paragraphs: [
        'Our APIs and data are provided on a best-effort basis. We select upstream projects based on their community standards and track records, but we do not have the capacity to independently validate, verify, or guarantee the accuracy, completeness, timeliness, or fitness for purpose of any data.',
        'You use the data at your own risk. Saanseoi, its contributors, and volunteers make no warranties, express or implied, regarding the quality or veracity of any data served through this platform.',
      ],
    },
    {
      heading: '5. No warranties on service availability',
      paragraphs: [
        'We strive to keep the service running reliably, but we are a volunteer citizen initiative with no obligation to maintain uptime. The service may be interrupted for maintenance, upgrades, or unforeseen reasons. We are not liable for any loss or inconvenience arising from service unavailability.',
      ],
    },
    {
      heading: '6. Acceptable use',
      paragraphs: ['You agree not to use our services to:'],
      bullets: [
        'Violate any applicable laws or regulations.',
        'Attempt to gain unauthorised access to our systems.',
        'Interfere with or disrupt the integrity of the service.',
        'Scrape, harvest, or use data in ways that violate the applicable upstream data licence.',
        'Misrepresent Saanseoi as the source or author of upstream data.',
      ],
    },
    {
      heading: '7. Intellectual property',
      paragraphs: [
        'Saanseoi does not claim ownership over upstream data, which is governed by its respective licences. The Saanseoi platform, including its design, code, and documentation, is a civic open-source project. Please refer to our repository for applicable licences.',
      ],
    },
    {
      heading: '8. Limitation of liability',
      paragraphs: [
        'To the maximum extent permitted by Hong Kong law, Saanseoi and its contributors shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of, or inability to use, our services or data.',
      ],
    },
    {
      heading: '9. Changes to these terms',
      paragraphs: [
        'We may update these terms from time to time. If we make material changes, we will notify registered API users by email before the changes take effect. Continued use of the service after changes are published constitutes acceptance of the revised terms.',
      ],
    },
    {
      heading: '10. Governing law',
      paragraphs: [
        'These terms are governed by the laws of Hong Kong SAR. Any disputes shall be subject to the non-exclusive jurisdiction of the courts of Hong Kong SAR.',
      ],
    },
    {
      heading: '11. Contact',
      paragraphs: [
        'Questions about these terms? Write to us at policy@saanseoi.hk. We are a community project and always happy to discuss.',
      ],
    },
  ],
  chineseSections: [
    {
      heading: '一、關於我們的服務',
      paragraphs: [
        '山水整合公開開放數據集，透過 API 及網絡平台免費提供，以「盡力而為」的原則運作。我們的目標是讓公民數據對所有人更有用、更易取用。',
      ],
    },
    {
      heading: '二、免費存取與合理使用',
      paragraphs: [
        '我們的 API 及數據免費提供。作為回報，我們希望你以公平、負責任的方式使用服務。若你的使用對我們的基礎設施造成不合理的負擔，例如過量的自動化請求，我們可能採取以下措施：',
      ],
      bullets: [
        '限制你的流量，以保護所有用戶的服務質量。',
        '與你聯絡商討並解決問題。',
        '若你的需求有令其他用戶的服務降級的風險，我們保留暫時或永久封鎖你的存取的權利。',
        '我們在採取限制行動前，會盡量先與你聯絡，並歡迎就大流量或研究用途進行溝通。',
      ],
    },
    {
      heading: '三、數據與授權',
      paragraphs: [
        '透過我們 API 提供的數據來自上游開放數據集，每個數據集均依其原始上游授權條款提供。若上游來源未指定授權，則以開放數據共用標注授權條款（ODC-By）提供，詳見 https://opendatacommons.org/licenses/by/',
        '授權資訊會與每個數據集一併顯示。你有責任查閱並遵守所使用數據的適用授權條款。山水不授予任何超出上游授權範圍的額外權利。',
      ],
    },
    {
      heading: '四、數據質量不作保證',
      paragraphs: [
        '我們的 API 及數據以「盡力而為」的原則提供。我們依據上游項目的社群標準及往績進行篩選，但我們沒有能力獨立核實或保證任何數據的準確性、完整性、時效性或適用性。',
        '你須自行承擔使用數據的風險。山水及其貢獻者、義工對本平台所提供的任何數據的質量或真實性，不作任何明示或暗示的保證。',
      ],
    },
    {
      heading: '五、服務可用性不作保證',
      paragraphs: [
        '我們致力保持服務穩定運行，但我們是義工性質的公民自發項目，對維持正常運行時間沒有法律責任。服務可能因維護、升級或不可預見的原因而中斷。我們對因服務不可用而造成的任何損失或不便概不負責。',
      ],
    },
    {
      heading: '六、可接受使用',
      paragraphs: ['你同意不以本服務進行以下行為：'],
      bullets: [
        '違反任何適用的法律或法規。',
        '嘗試未經授權存取我們的系統。',
        '干擾或破壞服務的完整性。',
        '以違反適用的上游數據授權條款的方式爬取、採集或使用數據。',
        '誤稱山水為上游數據的來源或作者。',
      ],
    },
    {
      heading: '七、知識產權',
      paragraphs: [
        '山水不對上游數據主張所有權，該等數據受各自授權條款規管。山水平台包括其設計、代碼及文檔，屬公民開源項目，適用授權請參閱我們的代碼庫。',
      ],
    },
    {
      heading: '八、責任限制',
      paragraphs: [
        '在香港法律允許的最大範圍內，山水及其貢獻者對因使用或無法使用本服務或數據而引起的任何直接、間接、附帶或後果性損害概不負責。',
      ],
    },
    {
      heading: '九、條款更新',
      paragraphs: [
        '我們可能不時更新本條款。如有重大更改，我們將在更改生效前以電郵通知已登記的 API 用戶。在更改發布後繼續使用本服務，即代表你接受修訂後的條款。',
      ],
    },
    {
      heading: '十、適用法律',
      paragraphs: [
        '本條款受香港特別行政區法律規管。任何爭議均受香港特別行政區法院非專屬管轄。',
      ],
    },
    {
      heading: '十一、聯絡我們',
      paragraphs: [
        '對本條款有任何疑問？請電郵 policy@saanseoi.hk 聯絡我們。我們是社群項目，隨時樂意溝通。',
      ],
    },
  ],
}

export const accessibilityPolicy: PolicyDocument = {
  title: 'Web Accessibility Policy',
  chineseTitle: '網站無障礙政策',
  version: '1',
  effectiveDate: '10 June 2026',
  contactEmail: 'policy@saanseoi.hk',
  standard: 'WCAG 2.1 Level AA',
  englishIntro: [
    'Saanseoi (山水 - saanseoi.hk) is committed to making our platform accessible to everyone, including people with disabilities. Civic data belongs to all of us - we want to make sure it is usable by all of us too.',
  ],
  chineseIntro: [
    '山水（saanseoi.hk）致力確保所有人，包括殘疾人士，均能使用我們的平台。公民數據屬於所有人，我們希望確保所有人都能使用它。',
  ],
  englishSections: [
    {
      heading: '1. Our commitment',
      paragraphs: [
        'We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA. These internationally recognised guidelines set out how to make web content more accessible to people with a wide range of disabilities, including visual, auditory, motor, and cognitive impairments.',
      ],
    },
    {
      heading: '2. What we are doing',
      paragraphs: ['As an ongoing effort, we seek to:'],
      bullets: [
        'Provide meaningful text alternatives for non-text content (e.g. images, icons).',
        'Ensure content can be navigated and used with a keyboard alone.',
        'Maintain sufficient colour contrast between text and backgrounds.',
        'Use clear, plain-language headings and labels.',
        'Ensure our platform works with common screen readers.',
        'Avoid content that flashes or causes accessibility hazards.',
        'Write code that is semantically structured and compatible with assistive technologies.',
      ],
    },
    {
      heading: '3. Current status',
      paragraphs: [
        'We are a volunteer civic initiative and our platform is under active development. We are working towards WCAG 2.1 Level AA conformance and will continue to improve accessibility as our platform evolves. Some areas of the platform may not yet fully meet these standards.',
        'If you encounter an accessibility barrier, we genuinely want to know about it.',
      ],
    },
    {
      heading: '4. Feedback and contact',
      paragraphs: [
        'If you experience any difficulty accessing our content, or if you believe part of our website does not meet accessibility standards, please contact us at policy@saanseoi.hk.',
        'We will acknowledge your message and aim to respond substantively within 14 days. Feedback about accessibility is taken seriously - it helps us improve the platform for everyone.',
      ],
    },
    {
      heading: '5. Third-party content',
      paragraphs: [
        'Our platform integrates data and, in some cases, tools from third-party sources. We cannot always control the accessibility of third-party content, but we seek to work with upstream sources and services that share our commitment to inclusion.',
      ],
    },
    {
      heading: '6. Policy review',
      paragraphs: [
        'We will review and update this policy periodically, and whenever significant changes are made to our platform. The current version is always available at saanseoi.hk. Registered users will be notified by email of material changes.',
      ],
    },
  ],
  chineseSections: [
    {
      heading: '一、我們的承諾',
      paragraphs: [
        '我們的目標是符合《網頁內容無障礙指引》（WCAG）2.1 AA 級的標準。這些國際公認的指引說明如何令網頁內容對視覺、聽覺、運動及認知障礙等各類殘疾人士更易取用。',
      ],
    },
    {
      heading: '二、我們的措施',
      paragraphs: ['我們持續努力以：'],
      bullets: [
        '為非文字內容（如圖片、圖示）提供有意義的文字替代說明。',
        '確保內容可僅透過鍵盤瀏覽及使用。',
        '保持文字與背景之間足夠的色彩對比。',
        '使用清晰、淺白的標題及標籤。',
        '確保平台可與常見的螢幕閱讀器配合使用。',
        '避免閃爍或造成無障礙危害的內容。',
        '以語義結構化的代碼編寫，並與輔助技術相容。',
      ],
    },
    {
      heading: '三、現況',
      paragraphs: [
        '我們是義工性質的公民自發項目，平台仍在積極開發中。我們正朝 WCAG 2.1 AA 級合規的目標邁進，並將隨平台發展持續改善無障礙功能。平台部分區域可能尚未完全達到上述標準。',
        '若你遇到任何無障礙障礙，我們誠摯希望收到你的意見。',
      ],
    },
    {
      heading: '四、意見反饋及聯絡方式',
      paragraphs: [
        '若你在存取我們的內容時遇到困難，或認為網站某部分未符合無障礙標準，請透過 policy@saanseoi.hk 聯絡我們。',
        '我們將確認收到你的訊息，並盡量在14個工作日內作出實質回覆。無障礙意見反饋對我們而言非常重要，有助我們為所有人改善平台。',
      ],
    },
    {
      heading: '五、第三方內容',
      paragraphs: [
        '我們的平台整合了來自第三方來源的數據及工具。我們未必能控制第三方內容的無障礙程度，但我們致力與共同重視包容性的上游來源及服務合作。',
      ],
    },
    {
      heading: '六、政策審閱',
      paragraphs: [
        '我們將定期審閱並更新本政策，以及在平台發生重大變更時更新。最新版本將持續於 saanseoi.hk 發布，已登記用戶將透過電郵獲悉重大更改。',
      ],
    },
  ],
}
