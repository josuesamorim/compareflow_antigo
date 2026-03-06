export default function AboutUs() {
  return (
    /* Wrapper para garantir fundo escuro em toda a tela */
    <div className="w-full bg-gray-900 min-h-screen">
      <main className="max-w-4xl mx-auto py-16 px-6 text-white">
        <h1 className="text-3xl font-black italic mb-8 uppercase tracking-tighter text-white">
          About <span className="text-[#ffdb00]">CompareFlow</span>
        </h1>

        <div className="space-y-8 text-white/90 leading-relaxed">
          <section>
            <p className="text-xl font-medium leading-relaxed text-white">
              CompareFlow is a premier price tracking and deal discovery platform dedicated to helping consumers navigate the complex world of online retail. 
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              Our Mission
            </h2>
            <p>
              In an era of fluctuating prices and endless options, finding the true value of a product can be challenging. Our mission is simple: to provide real-time price transparency. Operated by <strong>CompareFlow.TECH</strong>, we utilize advanced tracking technology to monitor thousands of products across major US retailers, ensuring you have the data you need to make informed purchasing decisions.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              How We Help You
            </h2>
            <p>
              We don&apos;t just list deals; we provide context. Our engine tracks historical price data to identify when a &quot;sale&quot; is actually a great deal. Whether you are looking for the latest smartphones, high-end TVs, or PC hardware, CompareFlow brings the best offers into a single, easy-to-use interface.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              Our Business Model
            </h2>
            <p>
              To keep our service free for all users, CompareFlow participates in affiliate marketing programs. This means that when you click on a deal and complete a purchase at a retailer like Best Buy or Amazon, we may earn a small commission at no extra cost to you. This independence allows us to focus entirely on technology and data accuracy.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-white border-b border-gray-800 pb-2">
              Corporate Transparency
            </h2>
            <p>
              CompareFlow is an independent entity and is not owned, operated, or endorsed by the retailers we track. We believe in total transparency, which is why our business identity, physical location, and contact information are always available to our users and partners.
            </p>
          </section>

          <div className="pt-10 border-t border-gray-800">
            <p className="text-sm font-bold uppercase tracking-widest text-[#ffdb00]">
              Headquarters
            </p>
            <p className="text-sm text-white font-bold mt-2">
              compareflow.club
            </p>
            <p className="text-sm text-[#ffdb00] mt-1 font-bold">
              Contact: hello@compareflow.club
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}