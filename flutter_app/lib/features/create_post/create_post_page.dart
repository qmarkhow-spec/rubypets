import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rubypets_flutter/providers/feed_provider.dart';
import 'package:rubypets_flutter/providers/session_provider.dart';
import 'package:rubypets_flutter/services/api_client.dart';

class CreatePostPage extends ConsumerStatefulWidget {
  const CreatePostPage({super.key});

  @override
  ConsumerState<CreatePostPage> createState() => _CreatePostPageState();
}

class _CreatePostPageState extends ConsumerState<CreatePostPage> {
  final _contentController = TextEditingController();
  String _visibility = 'public';
  bool _submitting = false;

  @override
  void dispose() {
    _contentController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;

    // Check login status via the sessionProvider
    if (ref.read(sessionProvider).valueOrNull == null) {
      _showSnack('Login required');
      return;
    }

    final content = _contentController.text.trim();
    if (content.isEmpty) {
      _showSnack('Content is required');
      return;
    }

    setState(() => _submitting = true);

    try {
      // Get the api client from its provider and create the post
      await ref
          .read(apiClientProvider)
          .createPost(content: content, visibility: _visibility);

      // Invalidate the feed provider to refresh the feed with the new post
      ref.invalidate(feedProvider);

      if (!mounted) return;
      _showSnack('Post created');
      Navigator.of(context).pop();
    } catch (err) {
      if (!mounted) return;
      final message = err is ApiException ? err.message : 'Request failed';
      _showSnack(message);
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create post'),
        actions: [
          TextButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Post'),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _contentController,
              decoration: const InputDecoration(
                hintText: 'Share something about your pet...',
              ),
              minLines: 4,
              maxLines: 8,
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _visibility,
              decoration: const InputDecoration(labelText: 'Visibility'),
              items: const [
                DropdownMenuItem(value: 'public', child: Text('public')),
                DropdownMenuItem(value: 'friends', child: Text('friends')),
                DropdownMenuItem(value: 'private', child: Text('private')),
              ],
              onChanged: (value) {
                if (value != null) {
                  setState(() => _visibility = value);
                }
              },
            ),
            const SizedBox(height: 12),
            Text(
              'Media posts are not supported yet in Flutter.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
