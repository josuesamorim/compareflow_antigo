export default function ReturnPolicy() {
  return (
    /* O wrapper abaixo garante que o fundo escuro ocupe toda a largura e altura da tela */
    <div className="w-full bg-gray-900 min-h-screen">
      <main className="max-w-4xl mx-auto py-16 px-6 text-white">
        <h1 className="text-3xl font-black italic mb-8 uppercase tracking-tighter text-white">
          Returns & <span className="text-[#ffdb00]">Refunds</span>
        </h1>

        <div className="space-y-8 text-white/90 leading-relaxed">
          <section>
            <p className="font-bold text-lg mb-4 text-white">
              CompareFlow provides price comparison services and does not sell, handle, or ship products. 
              Therefore, we do not process returns or issue refunds for any purchases.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              1. Merchant Return Policies
            </h2>
            <p>
              When you purchase a product through a link on CompareFlow, the transaction happens directly on the retailer&apos;s website (e.g., Best Buy, Amazon, Walmart). 
              All returns, exchanges, and refund requests are subject to the specific return policy of the merchant where the item was bought. 
              We strongly recommend reviewing the retailer&apos;s return policy before finalizing your purchase.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              2. How to Initiate a Return
            </h2>
            <p>
              To return an item, you must contact the customer service department of the store that sold you the product. 
              Common steps include:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-white/80">
              <li>Locating your order confirmation email from the retailer.</li>
              <li>Visiting the &quot;Orders&quot; or &quot;Customer Service&quot; section on the merchant&apos;s website.</li>
              <li>Following their specific instructions for shipping the item back or returning it to a physical store.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              3. Refund Process
            </h2>
            <p>
              Refunds are processed by the merchant, not by CompareFlow. The time it takes to receive your money back 
              depends on the retailer&apos;s processing times and your bank or credit card issuer. 
              CompareFlow does not have access to financial transaction details and cannot intervene in refund disputes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              4. Damaged or Incorrect Items
            </h2>
            <p>
              If you receive a product that is damaged, defective, or different from what you ordered, 
              you must report the issue directly to the retailer. They are responsible for providing 
              resolutions such as replacements, repairs, or full refunds.
            </p>
          </section>

          <section className="space-y-4 border-t border-gray-800 pt-8">
            <h2 className="text-xl font-black uppercase tracking-widest text-white">
              5. Limitation of Liability
            </h2>
            <p>
              CompareFlow shall not be held liable for any dissatisfaction with a merchant&apos;s 
              return process or for any losses incurred during a return or refund dispute. 
              Our role is strictly limited to providing price information and redirecting users to the respective stores.
            </p>
          </section>

          <div className="pt-10">
            <p className="text-sm font-bold uppercase tracking-widest text-[#ffdb00]">
              Last Updated: February 2026
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}