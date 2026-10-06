async function check() {
  try {
    const res = await fetch('http://localhost:5000/api/billing/plans', { signal: AbortSignal.timeout(10000) });
    console.log('STATUS:', res.status);
    const text = await res.text();
    console.log('BODY:', text);
  } catch (err) {
    console.error('ERROR:', err);
  }
}
check();
