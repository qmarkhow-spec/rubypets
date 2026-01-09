import { headers } from 'next/headers';

export const runtime = 'edge';

export default async function NotFound() {
  const headersList = headers();
  const domain = headersList.get('host');

  return (
    &lt;div&gt;
      &lt;h2&gt;Not Found&lt;/h2&gt;
      &lt;p&gt;Could not find requested resource&lt;/p&gt;
      &lt;p&gt;(on {domain})&lt;/p&gt;
    &lt;/div&gt;
  );
}