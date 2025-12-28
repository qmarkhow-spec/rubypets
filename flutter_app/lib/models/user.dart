class ApiUser {
  ApiUser({
    required this.id,
    required this.displayName,
    required this.handle,
    required this.email,
  });

  final String id;
  final String displayName;
  final String handle;
  final String? email;

  factory ApiUser.fromJson(Map<String, dynamic> json) {
    return ApiUser(
      id: json['id']?.toString() ?? '',
      displayName: json['displayName']?.toString() ?? '',
      handle: json['handle']?.toString() ?? '',
      email: json['email']?.toString(),
    );
  }
}
