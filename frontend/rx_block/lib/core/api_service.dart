class ApiService {

  static Future<Map<String, dynamic>> scan(String qr) async {
    await Future.delayed(Duration(seconds: 1));

    return {
      "status": qr == "B1" ? "valid" : "fake",
      "batchId": qr,
      "chain": ["Manufacturer", "Distributor", "Pharmacy"]
    };
  }

  static Future<bool> acceptBatch(String id) async {
    await Future.delayed(Duration(seconds: 1));
    return true;
  }

  static Future<bool> acceptAtPharmacy(String id) async {
    await Future.delayed(Duration(seconds: 1));
    return true;
  }
}