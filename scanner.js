let html5QrCode = null;
let lastScannedCode = '';
let lastScanTime = 0;
let isScanning = false;

function stopScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode = null;
        }).catch(() => {});
    }
    isScanning = false;
    document.getElementById('scannerModal').classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('scanBtn').textContent = '📷 Scan';
    document.getElementById('scanStatus').textContent = '';
}

function startScanner() {
    document.getElementById('scannerModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('scanBtn').textContent = '⏹️ Stop';
    document.getElementById('scanStatus').textContent = 'Point camera at book barcode...';
    
    html5QrCode = new Html5Qrcode('scanner');
    
    html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 300, height: 100 } },
        (decodedText) => {
            const now = Date.now();
            const code = decodedText.trim();
            
            if (code === lastScannedCode && (now - lastScanTime) < 2000) {
                return;
            }
            
            if (!/^\d{10}$/.test(code) && !/^\d{13}$/.test(code)) {
                console.log('Ignoring non-ISBN:', code);
                return;
            }
            
            if (code.length === 13 && !code.startsWith('978') && !code.startsWith('979')) {
                console.log('Ignoring non-book barcode:', code);
                return;
            }
            
            lastScannedCode = code;
            lastScanTime = now;
            
            console.log('Scanned ISBN:', code);
            document.getElementById('isbnInput').value = code;
            document.getElementById('scanStatus').textContent = '✓ Found: ' + code;
            
            setTimeout(() => {
                stopScanner();
                lookupBook();
            }, 300);
        },
        (errorMessage) => {
            // Ignore scan errors
        }
    ).catch(err => {
        document.getElementById('scanStatus').textContent = '❌ Camera error: ' + err;
        stopScanner();
    });
}

function toggleScan() {
    if (isScanning) {
        stopScanner();
    } else {
        isScanning = true;
        startScanner();
    }
}