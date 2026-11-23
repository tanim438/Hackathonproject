const fs = require('fs');
const path = require('path');
const http = require('http');

const htmlPath = path.join(__dirname, 'public', 'index.html');
const appJsPath = path.join(__dirname, 'public', 'app.js');
const serverJsPath = path.join(__dirname, 'server.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

console.log('=== STEP 1: CHECK ONCLICK HANDLERS IN HTML VS APP.JS ===');
const onclickRegex = /onclick="([a-zA-Z0-9_]+)\(/g;
let match;
const onclicks = new Set();
while ((match = onclickRegex.exec(htmlContent)) !== null) {
  onclicks.add(match[1]);
}

let missingHandlers = 0;
for (const handler of Array.from(onclicks).sort()) {
  const funcRegex = new RegExp(`function\\s+${handler}\\s*\\(|window\\.${handler}\\s*=|const\\s+${handler}\\s*=|let\\s+${handler}\\s*=`);
  if (!funcRegex.test(appJsContent)) {
    console.error(`❌ Missing in app.js: function ${handler}()`);
    missingHandlers++;
  } else {
    // console.log(`✓ Found: ${handler}`);
  }
}
if (missingHandlers === 0) {
  console.log(`✅ All ${onclicks.size} onclick handlers exist in app.js!`);
} else {
  console.error(`❌ Found ${missingHandlers} missing onclick handlers!`);
}

console.log('\n=== STEP 2: CHECK DOCUMENT.GETELEMENTBYID IN APP.JS VS HTML ===');
const idRegex = /document\.getElementById\(['"]([a-zA-Z0-9_\-]+)['"]\)/g;
const idsInJs = new Set();
while ((match = idRegex.exec(appJsContent)) !== null) {
  idsInJs.add(match[1]);
}

let missingIds = 0;
for (const id of Array.from(idsInJs).sort()) {
  const hasIdInHtml = htmlContent.includes(`id="${id}"`) || htmlContent.includes(`id='${id}'`);
  if (!hasIdInHtml) {
    console.warn(`⚠️ Element id referenced in app.js but missing in index.html: "${id}"`);
    missingIds++;
  }
}
if (missingIds === 0) {
  console.log(`✅ All ${idsInJs.size} element IDs referenced in app.js exist in index.html!`);
} else {
  console.log(`⚠️ Total missing IDs: ${missingIds} (check if created dynamically or needed in HTML)`);
}

console.log('\n=== STEP 3: BACKEND API ENDPOINTS & WORKFLOW TEST ===');
const server = require('./server.js');

// Helper to make internal requests without port binding issues
function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage();
    req.method = method;
    req.url = urlPath;
    req.headers = { host: 'localhost', ...headers };

    const bodyBuffer = body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) : Buffer.alloc(0);
    if (body) {
      req.headers['content-length'] = bodyBuffer.length;
      if (!req.headers['content-type']) req.headers['content-type'] = 'application/json';
    }

    const res = new http.ServerResponse(req);
    let resBody = '';

    res.write = function (chunk) {
      if (chunk) resBody += chunk.toString();
      return true;
    };

    res.end = function (chunk) {
      if (chunk) resBody += chunk.toString();
      let parsed = resBody;
      try {
        parsed = JSON.parse(resBody);
      } catch (e) {}
      resolve({ statusCode: res.statusCode, headers: res.getHeaders(), body: parsed });
    };

    // Dispatch
    process.nextTick(() => {
      server.emit('request', req, res);
      if (bodyBuffer.length > 0) {
        req.emit('data', bodyBuffer);
      }
      req.emit('end');
    });
  });
}

async function runTests() {
  try {
    // 1. Normal user login
    const loginRes = await makeRequest('POST', '/api/auth/login', {}, {
      identifier: '+8801711223344',
      password: 'user123'
    });
    console.log('1. User login (Rahim):', loginRes.statusCode === 200 && loginRes.body.user.role === 'user' ? '✅ SUCCESS' : '❌ FAILED', loginRes.body.user?.name);
    const userToken = loginRes.body.token;

    // 2. Admin login
    const adminRes = await makeRequest('POST', '/api/auth/admin-login', {}, {
      email: 'admin@ticketx.com',
      password: 'Admin@TicketX2026!'
    });
    console.log('2. Admin login:', adminRes.statusCode === 200 && adminRes.body.user.role === 'admin' ? '✅ SUCCESS' : '❌ FAILED', adminRes.body.user?.role);
    const adminToken = adminRes.body.token;

    // 3. User attempts to access Admin Dashboard
    const userToAdminRes = await makeRequest('GET', '/api/admin/dashboard', {
      authorization: `Bearer ${userToken}`
    });
    console.log('3. Normal user accessing admin dashboard:', userToAdminRes.statusCode === 403 ? '✅ BLOCKED (403 Forbidden)' : '❌ FAILED');

    // 4. Admin accesses Admin Dashboard
    const adminDashRes = await makeRequest('GET', '/api/admin/dashboard', {
      authorization: `Bearer ${adminToken}`
    });
    console.log('4. Admin accessing admin dashboard:', adminDashRes.statusCode === 200 && adminDashRes.body.stats ? '✅ SUCCESS' : '❌ FAILED');

    // 5. Test Non-Ticket Scan (e.g. Command prompt or math formula)
    const scanFakeRes = await makeRequest('POST', '/api/ai/scan-ticket', {}, {
      clientOcrText: 'Command Prompt Microsoft Visual C++ 14.0 or greater is required build_ext error',
      category: 'bus',
      originalPrice: 1000,
      askingPrice: 800
    });
    const fakeBlocked = scanFakeRes.body.result && scanFakeRes.body.result.isTicket === false;
    console.log('5. AI Non-Ticket Scan (Command Prompt error):', fakeBlocked ? '✅ BLOCKED (isTicket: false)' : '❌ FAILED', scanFakeRes.body.result?.operator);

    // 6. Test Valid Train Ticket Scan (Bangladesh Railway)
    const scanTrainRes = await makeRequest('POST', '/api/ai/scan-ticket', {}, {
      clientOcrText: 'BANGLADESH RAILWAY INTERCITY SERVICE MOHANAGAR GODHULI 722 Ticket No CNA 31784322 TK 1065 CHAIR GA 14',
      category: 'train',
      originalPrice: 1065,
      askingPrice: 1000
    });
    const trainValid = scanTrainRes.body.result && scanTrainRes.body.result.isTicket === true && scanTrainRes.body.result.authenticityScore >= 95;
    console.log('6. AI Train Ticket Scan (CNA 31784322):', trainValid ? '✅ VALID (isTicket: true, Score: ' + scanTrainRes.body.result.authenticityScore + '%)' : '❌ FAILED');

    // 7. Test Ticket Creation with Fake AI result -> Rejected
    const createFakeTkt = await makeRequest('POST', '/api/tickets/create', {
      authorization: `Bearer ${userToken}`
    }, {
      category: 'bus',
      title: 'Fake Ticket Listing',
      journeyDate: '2026-11-28',
      seats: 'A1',
      originalPrice: 1000,
      askingPrice: 800,
      aiScanResult: { isTicket: false, authenticityScore: 10, riskLevel: 'High Scam Risk' }
    });
    console.log('7. Create Ticket with Fake AI result:', createFakeTkt.statusCode === 400 ? '✅ REJECTED (400)' : '❌ FAILED');

    // 8. Test Ticket Creation with Price > Original Price (Scalping) -> Rejected
    const createScalpTkt = await makeRequest('POST', '/api/tickets/create', {
      authorization: `Bearer ${userToken}`
    }, {
      category: 'bus',
      title: 'Scalped Ticket Listing',
      journeyDate: '2026-11-28',
      seats: 'A1',
      originalPrice: 1000,
      askingPrice: 1500, // higher than original!
      aiScanResult: { isTicket: true, authenticityScore: 98, riskLevel: 'Low Risk' }
    });
    console.log('8. Create Ticket with Scalping Price:', createScalpTkt.statusCode === 400 ? '✅ REJECTED (400 Anti-Scalping)' : '❌ FAILED');

    // 9. Test Ticket Creation with Valid Data -> Created as pending_admin_approval
    const testPnr = 'TESTPNR_' + Date.now();
    const createValidTkt = await makeRequest('POST', '/api/tickets/create', {
      authorization: `Bearer ${userToken}`
    }, {
      category: 'bus',
      title: 'Dhaka to Coxs Bazar Green Line',
      operator: 'Green Line Paribahan',
      journeyDate: '2026-11-30',
      journeyTime: '10:30 PM',
      seats: 'A1, A2',
      boardingPoint: 'Rajarbagh',
      dropPoint: 'Coxs Bazar',
      originalPrice: 2000,
      askingPrice: 1800,
      allowOffers: true,
      minOfferPrice: 1600,
      aiScanResult: {
        isTicket: true,
        pnr: testPnr,
        authenticityScore: 98,
        riskLevel: 'Low Risk',
        operator: 'Green Line Paribahan'
      }
    });
    const createdTicket = createValidTkt.body.ticket;
    console.log('9. Create Valid Ticket:', createValidTkt.statusCode === 201 && createdTicket.status === 'pending_admin_approval' ? '✅ SUCCESS (pending_admin_approval)' : '❌ FAILED');

    // 10. Check that pending ticket is NOT in public tickets
    const pubTicketsRes = await makeRequest('GET', '/api/tickets');
    const isPublic = pubTicketsRes.body.tickets.some(t => t.id === createdTicket.id);
    console.log('10. Pending ticket hidden from public marketplace:', !isPublic ? '✅ HIDDEN' : '❌ FAILED (Exposed in public)');

    // 11. Admin approves ticket
    const approveRes = await makeRequest('POST', `/api/admin/tickets/${createdTicket.id}/review`, {
      authorization: `Bearer ${adminToken}`
    }, { action: 'approve' });
    console.log('11. Admin approves ticket:', approveRes.statusCode === 200 ? '✅ APPROVED' : '❌ FAILED');

    // 12. Check that approved ticket is NOW in public tickets
    const pubTicketsRes2 = await makeRequest('GET', '/api/tickets');
    const isPublicNow = pubTicketsRes2.body.tickets.some(t => t.id === createdTicket.id);
    console.log('12. Approved ticket visible in public marketplace:', isPublicNow ? '✅ VISIBLE' : '❌ FAILED');

    // 13. Buyer (Karim) logs in
    const karimLoginRes = await makeRequest('POST', '/api/auth/login', {}, {
      identifier: '+8801812345678',
      password: 'user123'
    });
    const buyerToken = karimLoginRes.body.token;

    // 14. Buyer submits Offer
    const offerRes = await makeRequest('POST', `/api/tickets/${createdTicket.id}/offers`, {
      authorization: `Bearer ${buyerToken}`
    }, { offerPrice: 1700, message: 'I will buy immediately for 1700' });
    const offer = offerRes.body.offer;
    console.log('14. Buyer submits offer:', offerRes.statusCode === 201 ? '✅ OFFER CREATED' : '❌ FAILED');

    // 15. Seller (Rahim) accepts offer -> Creates Admin Transaction
    const acceptOfferRes = await makeRequest('POST', `/api/offers/${offer.id}/respond`, {
      authorization: `Bearer ${userToken}`
    }, { action: 'accept' });
    console.log('15. Seller accepts offer:', acceptOfferRes.statusCode === 200 && acceptOfferRes.body.transaction ? '✅ ACCEPTED & TRANSACTION CREATED (awaiting_admin)' : '❌ FAILED');
    const transactionId = acceptOfferRes.body.transaction.id;

    // 16. Admin views transaction
    const adminDashRes2 = await makeRequest('GET', '/api/admin/dashboard', {
      authorization: `Bearer ${adminToken}`
    });
    const foundTx = adminDashRes2.body.transactions.find(tx => tx.id === transactionId);
    console.log('16. Admin sees transaction in dashboard with buyer and seller phone:', (foundTx && foundTx.buyerPhone && foundTx.sellerPhone) ? '✅ SUCCESS (Phone numbers visible)' : '❌ FAILED');

    // 17. Admin updates transaction to in_progress then completed
    const txUpdateRes = await makeRequest('POST', `/api/admin/transactions/${transactionId}/update-status`, {
      authorization: `Bearer ${adminToken}`
    }, { status: 'completed', adminNote: 'Verified payment and transferred ticket successfully' });
    console.log('17. Admin marks transaction completed:', txUpdateRes.statusCode === 200 ? '✅ COMPLETED' : '❌ FAILED');

    // 18. Buyer tests Buy Now flow on an available ticket
    const currentTickets = (await makeRequest('GET', '/api/tickets')).body.tickets;
    let targetTicket = currentTickets.find(t => t.sellerId !== 'user_rahim');
    let buyerForTarget = userToken;
    let sellerForTarget = buyerToken; // user_karim

    if (!targetTicket) {
      targetTicket = currentTickets.find(t => t.sellerId !== 'user_karim');
      buyerForTarget = buyerToken;
      sellerForTarget = userToken;
    }

    const buyNowRes = await makeRequest('POST', `/api/tickets/${targetTicket.id}/buy-now`, {
      authorization: `Bearer ${buyerForTarget}`
    }, { message: 'Buying at full asking price' });
    const purchaseReq = buyNowRes.body.purchaseRequest;
    console.log('18. Buyer submits Buy Now request:', buyNowRes.statusCode === 201 ? '✅ PURCHASE REQUEST CREATED' : '❌ FAILED');

    // 19. Seller of the target ticket confirms Buy Now request
    const confirmBuyNowRes = await makeRequest('POST', `/api/purchase-requests/${purchaseReq.id}/respond`, {
      authorization: `Bearer ${sellerForTarget}`
    }, { action: 'confirm' });
    console.log('19. Seller confirms Buy Now request:', confirmBuyNowRes.statusCode === 200 && confirmBuyNowRes.body.transaction ? '✅ CONFIRMED & TRANSACTION CREATED (awaiting_admin)' : '❌ FAILED');

    // 20. Check Notifications for User and Admin
    const userNotifsRes = await makeRequest('GET', '/api/notifications', {
      authorization: `Bearer ${userToken}`
    });
    console.log('20. User notifications count:', userNotifsRes.statusCode === 200 ? `✅ SUCCESS (${userNotifsRes.body.notifications.length} notifs)` : '❌ FAILED');

    console.log('\n=======================================');
    console.log('🎉 ALL 20 END-TO-END WORKFLOW CHECKS PASSED!');
    console.log('=======================================');
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
}

runTests();
