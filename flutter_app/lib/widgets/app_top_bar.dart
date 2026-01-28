import 'package:flutter/material.dart';

class AppTopBar extends StatelessWidget implements PreferredSizeWidget {
  const AppTopBar({
    super.key,
    required this.onAddPost,
    required this.onLogoTap,
    required this.onMessages,
  });

  final VoidCallback onAddPost;
  final VoidCallback onLogoTap;
  final VoidCallback onMessages;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      leadingWidth: 64,
      leading: IconButton(
        icon: const Icon(Icons.add_circle_outlined),
        tooltip: 'Create post',
        onPressed: onAddPost,
      ),
      title: InkWell(
        onTap: onLogoTap,
        borderRadius: BorderRadius.circular(24),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.pets),
            SizedBox(width: 8),
            Text(
              'RubyPets',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
      centerTitle: true,
      actions: [
        IconButton(
          icon: const Icon(Icons.message_outlined),
          tooltip: 'Messages',
          onPressed: onMessages,
        ),
      ],
    );
  }
}
