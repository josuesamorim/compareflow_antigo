export default function TermsOfUse() {
  return (
    /* Wrapper para garantir fundo escuro em toda a tela */
    <div className="w-full bg-gray-900 min-h-screen">
      <main className="max-w-4xl mx-auto py-16 px-6 text-white">
        <h1 className="text-3xl font-black italic mb-8 uppercase tracking-tighter text-white">
          Terms of <span className="text-[#ffdb00]">Use</span>
        </h1>

        <div className="space-y-8 text-white/90 leading-relaxed">
          <section>
            <p className="font-bold text-lg mb-4 text-white">
              Welcome to PRICELAB. By accessing our website (pricelab.tech), you agree to comply with and be bound by the following terms and conditions.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              1. Nature of Service
            </h2>
            <p>
              PRICELAB, is an independent price comparison and information service. We provide real-time data on price drops, deals, and product specifications from various retailers. We are NOT a retailer, and we do not sell any products directly to users.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              2. Accuracy of Information
            </h2>
            <p>
              While we use advanced technology to track prices and availability, the data provided is for informational purposes only. Prices and product availability are determined by the respective retailers and are subject to change without notice. In the event of a discrepancy between our site and the merchant&apos;s site, the merchant&apos;s data shall prevail.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              3. Affiliate Relationship
            </h2>
            <p>
              PRICELAB participates in various affiliate marketing programs. This means that when you click on links to retailers and make a purchase, we may receive a small commission. This relationship does not influence our price tracking or the cost to the user.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              4. Third-Party Links and Transactions
            </h2>
            <p>
              Our service contains links to third-party websites. Any purchase made through these links is a transaction exclusively between you and the third-party merchant. PRICELABis not responsible for any issues regarding product quality, shipping, payments, or security on external sites.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              5. Intellectual Property
            </h2>
            <p>
              All trademarks, logos, and brand names displayed on this site are the property of their respective owners (e.g., Apple, Best Buy). PRICELAB uses these names for identification and comparison purposes only, and such use does not imply endorsement by the brand owners.
            </p>
          </section>

          <section className="space-y-4 border-t border-gray-800 pt-8">
            <h2 className="text-xl font-black uppercase tracking-widest text-white">
              6. Limitation of Liability
            </h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, PRICELAB SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE OF THE WEBSITE OR ANY INACCURACIES IN THE DATA PROVIDED.
            </p>
          </section>

          <div className="pt-10 border-t border-gray-800">
            <p className="text-sm font-bold uppercase tracking-widest text-[#ffdb00]">
              Last Updated: February 2026
            </p>
            <p className="text-xs text-white/50 mt-2 italic">
              PRICELAB.TECH
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}