enum FriendshipStatus {
  none,
  pendingOutgoing,
  pendingIncoming,
  friends,
}

FriendshipStatus parseFriendshipStatus(String? value) {
  switch (value) {
    case 'pending_outgoing':
      return FriendshipStatus.pendingOutgoing;
    case 'pending_incoming':
      return FriendshipStatus.pendingIncoming;
    case 'friends':
      return FriendshipStatus.friends;
    default:
      return FriendshipStatus.none;
  }
}

class OwnerSummary {
  OwnerSummary({
    required this.id,
    required this.displayName,
    this.avatarUrl,
    this.city,
    this.region,
  });

  final String id;
  final String displayName;
  final String? avatarUrl;
  final String? city;
  final String? region;

  String get locationLabel {
    final parts = <String>[
      if (city != null && city!.trim().isNotEmpty) city!.trim(),
      if (region != null && region!.trim().isNotEmpty) region!.trim(),
    ];
    return parts.join(' ');
  }

  factory OwnerSummary.fromJson(Map<String, dynamic> json) {
    return OwnerSummary(
      id: (json['uuid'] ?? json['id'])?.toString() ?? '',
      displayName: (json['displayName'] ?? json['display_name'])?.toString() ?? '',
      avatarUrl: (json['avatarUrl'] ?? json['avatar_url'])?.toString(),
      city: json['city']?.toString(),
      region: json['region']?.toString(),
    );
  }
}

class OwnerDetail extends OwnerSummary {
  OwnerDetail({
    required super.id,
    required super.displayName,
    super.avatarUrl,
    super.city,
    super.region,
    this.email,
  });

  final String? email;

  factory OwnerDetail.fromJson(Map<String, dynamic> json) {
    final summary = OwnerSummary.fromJson(json);
    return OwnerDetail(
      id: summary.id,
      displayName: summary.displayName,
      avatarUrl: summary.avatarUrl,
      city: summary.city,
      region: summary.region,
      email: json['email']?.toString(),
    );
  }
}
