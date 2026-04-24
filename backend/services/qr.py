import qrcode
import io

# 1. Private Helper: Handles the actual image generation
def _create_qr_buffer(qr_data: str) -> io.BytesIO:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H, 
        box_size=10,
        border=4,
    )
    qr.add_data(qr_data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0) 
    
    return buffer

# 2. Public Function: For the main cardboard box (Aggregation)
def generate_batch_qr(batch_id: str) -> io.BytesIO:
    """Generates a QR code for an entire Batch."""
    base_url = "http://192.168.20.76:5500/verify.html" 
    qr_data = f"{base_url}?batch_id={batch_id}"
    
    return _create_qr_buffer(qr_data)

# 3. Public Function: For the individual pill strip (Serialization)
def generate_drug_qr(drug_id: str) -> io.BytesIO:
    """Generates a QR code for an individual Drug Unit."""
    base_url = "http://192.168.20.76:5500/verify.html" 
    qr_data = f"{base_url}?drug_id={drug_id}"
    
    return _create_qr_buffer(qr_data)