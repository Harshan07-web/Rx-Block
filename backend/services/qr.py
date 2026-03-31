import qrcode
import hashlib
import io

def generate_secure_hash(manufacturer: str, mfg_date: str) -> str:
    """Creates a unique cryptographic hash to verify authenticity."""
    data_string = f"{manufacturer}-{mfg_date}"
    return hashlib.sha256(data_string.encode()).hexdigest()

def generate_qr_image(batch_id: str, unique_hash: str) -> io.BytesIO:
    """Generates a QR code image and returns it as a byte stream."""
    
    # ---------------------------------------------------------
    # 🚀 NEW: THE "REAL WORLD" URL FIX
    # Change this to your live domain name when you deploy!
    # For local VS Code Live Server, it is usually port 5500 or 5501.
    base_url = "http://192.168.20.76:5500/rxblock (1).html" 
    
    # Embed the URL with the batch_id attached to the end
    qr_data = f"{base_url}?batch_id={batch_id}"
    # ---------------------------------------------------------
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H, # High error correction for scanning
        box_size=10,
        border=4,
    )
    qr.add_data(qr_data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    
    # Save the image to a buffer in memory so FastAPI can stream it back
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0) # Reset pointer to the start of the file
    
    return buffer