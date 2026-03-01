export default function ShippingPolicy() {
  return (
    /* O wrapper abaixo garante que o fundo escuro ocupe toda a lateral (w-full) e altura (min-h-screen) */
    <div className="w-full bg-gray-900 min-h-screen">
      <main className="max-w-4xl mx-auto py-16 px-6 text-white">
        <h1 className="text-3xl font-black italic mb-8 uppercase tracking-tighter text-white">
          Shipping <span className="text-[#ffdb00]">Policy</span>
        </h1>

        <div className="space-y-8 text-white/90 leading-relaxed">
          <section>
            <p className="font-bold text-lg mb-4">
              PRICELAB is a price comparison and deal-tracking platform. 
              We are not a retailer, and we do not sell or ship any products directly.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              1. Shipping Responsibility
            </h2>
            <p>
              All products listed on PRICELAB are sold and fulfilled by third-party retailers (e.g., Best Buy, Amazon, etc.). 
              When you click on a deal or a "View Deal" button, you are redirected to the merchant&apos;s official website to complete your purchase. 
              Therefore, the retailer is solely responsible for the shipping, delivery, and handling of your order.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              2. Shipping Costs and Methods
            </h2>
            <p>
              Shipping costs, available methods (Standard, Expedited, Next-Day), and delivery estimates are determined 
              exclusively by the merchant. While we strive to display accurate information, we recommend verifying 
              the shipping fees on the retailer&apos;s checkout page before finalizing your order.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              3. Tracking Your Order
            </h2>
            <p>
              Since PRICELAB does not process orders, we do not have access to your purchase history or tracking numbers. 
              To track your shipment, please refer to the confirmation email sent by the retailer or log in to your 
              account on the retailer&apos;s website.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              4. International Shipping
            </h2>
            <p>
              The availability of international shipping depends on the specific retailer&apos;s policies. 
              Most deals featured on PRICELAB are focused on the United States market unless otherwise stated.
            </p>
          </section>

          <section className="space-y-4 border-t border-gray-800 pt-8">
            <h2 className="text-xl font-black uppercase tracking-widest text-white">
              5. Shipping Disputes
            </h2>
            <p>
              In the event of a delayed, lost, or damaged shipment, you must contact the customer support team of 
              the retailer where the purchase was made. PRICELAB is not liable for any issues arising from the 
              transportation or delivery of products.
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