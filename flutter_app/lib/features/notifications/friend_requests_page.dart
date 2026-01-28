import 'package:flutter/material.dart';

class FriendRequestsPage extends StatelessWidget {
  const FriendRequestsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Friend requests')),
      body: const Center(
        child: Text('Friend request list will appear here.'),
      ),
    );
  }
}
