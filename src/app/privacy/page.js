export default function PrivacyPolicy() {
  return (
    /* Wrapper para garantir fundo escuro em toda a tela */
    <div className="w-full bg-gray-900 min-h-screen">
      <main className="max-w-4xl mx-auto py-16 px-6 text-white">
        <h1 className="text-3xl font-black italic mb-8 uppercase tracking-tighter text-white">
          Privacy <span className="text-[#ffdb00]">Policy</span>
        </h1>

        <div className="space-y-8 text-white/90 leading-relaxed">
          <section>
            <p className="font-bold text-lg mb-4 text-white">
              At PRICELAB we value your privacy. This policy explains how we collect, use, and protect your information when you visit pricelab.tech.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              1. Information We Collect
            </h2>
            <p>
              We do not require users to create an account or provide personal identification (such as name or social security numbers) to browse our price comparisons. However, we may collect:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-white/80">
              <li><strong>Usage Data:</strong> IP addresses, browser type, and pages visited to improve our service.</li>
              <li><strong>Cookies:</strong> Small files used to remember your preferences and for affiliate tracking purposes.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              2. How We Use Your Information
            </h2>
            <p>
              The information we collect is used to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-white/80">
              <li>Maintain and optimize the performance of the price tracking engine.</li>
              <li>Analyze traffic patterns to provide better deal recommendations.</li>
              <li>Ensure that our affiliate links function correctly so we can earn commissions that keep our service free.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              3. Affiliate and Third-Party Links
            </h2>
            <p>
              PRICELAB contains links to external retailers. Please be aware that once you click on a link and leave our site, you are subject to the privacy policy of the merchant (e.g., Best Buy, Amazon). We do not have control over how third-party sites collect or use your personal data or financial information.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              4. Data Security
            </h2>
            <p>
              We implement industry-standard security measures to protect the integrity of our website. Since we do not process payments or store sensitive financial data, the risk to your personal information on our platform is minimal.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              5. Children&apos;s Privacy
            </h2>
            <p>
              Our service is not intended for children under the age of 13. We do not knowingly collect personal information from children.
            </p>
          </section>

          <section className="space-y-4 border-t border-gray-800 pt-8">
            <h2 className="text-xl font-black uppercase tracking-widest text-white">
              6. California Privacy Rights (CCPA)
            </h2>
            <p>
              California residents have the right to request information about the categories of data we collect and the right to request the deletion of such data. For any privacy-related requests, please contact us at the email below.
            </p>
          </section>

          <div className="pt-10 border-t border-gray-800">
            <p className="text-sm font-bold uppercase tracking-widest text-[#ffdb00]">
              Last Updated: February 2026
            </p>
            <p className="text-sm text-white font-bold mt-4">
              PRICELAB.TECH
            </p>
            
            <p className="text-sm text-[#ffdb00] mt-1 font-bold">
              Email: pricelab.tech@gmail.com
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}