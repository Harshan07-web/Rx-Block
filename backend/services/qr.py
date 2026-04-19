import qrcode
import hashlib
import io

def generate_qr_image(identifier: str, is_batch: bool = True) -> io.BytesIO:
    base_url = "http://192.168.20.76:5500/verify.html" 
    
    param = "batch_id" if is_batch else "drug_id"
    qr_data = f"{base_url}?{param}={identifier}"
    
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