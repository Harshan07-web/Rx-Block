import 'dart:convert';
import 'package:http/http.dart' as http;

// The special IP address that points the emulator to your laptop's localhost
const String baseUrl = "http://192.168.20.76:8000";

class BatchServices {
  static Future<http.Response> createWithQr({
    required String batchId,
    required String drugName,
    required String manufacturer,
    required String manufacturingDate,
    required String expiryDate,
    required int quantity,
  }) async {
    final uri = Uri.parse('$baseUrl/batch/create-with-qr');
    final payload = {
      'batch_id': batchId,
      'drug_name': drugName,
      'manufacturer': manufacturer,
      'manufacturing_date': manufacturingDate,
      'expiry_date': expiryDate,
      'quantity': quantity,
    };

    return await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );
  }

  static Future<http.Response> getBatch(String batchId) async {
    final uri = Uri.parse('$baseUrl/batch/$batchId');
    return await http.get(uri);
  }

  static Future<http.Response> splitBatch({
    required String parentId,
    required String newId,
    required String to,
    required int quantity,
  }) async {
    final uri = Uri.parse('$baseUrl/batch/split');
    return await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'parentId': parentId, 'newId': newId, 'to': to, 'quantity': quantity}),
    );
  }

  static Future<http.Response> transferBatch({
    required String id,
    required String to,
  }) async {
    final uri = Uri.parse('$baseUrl/batch/transfer');
    return await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'id': id, 'to': to}),
    );
  }

  static Future<http.Response> acceptBatch(String id) async {
    final uri = Uri.parse('$baseUrl/batch/accept');
    return await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'id': id}),
    );
  }

  static Future<http.Response> sellBatch({
    required String id,
    required int quantity,
  }) async {
    final uri = Uri.parse('$baseUrl/batch/sell');
    return await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'id': id, 'quantity': quantity}),
    );
  }
}
