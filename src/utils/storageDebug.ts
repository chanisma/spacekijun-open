import { supabase } from '@/integrations/supabase/client';

/**
 * Debug utilities for storage deletion issues
 */

export const debugStorageDeletion = async (storagePath: string) => {
  console.log('🔍 Storage Deletion Debug');
  console.log('========================');
  
  try {
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('❌ User not authenticated:', authError);
      return;
    }
    
    console.log(`👤 Current user ID: ${user.id}`);
    console.log(`📁 Storage path to delete: ${storagePath}`);
    
    // Parse the storage path to check folder structure
    const pathParts = storagePath.split('/');
    console.log(`📂 Path parts:`, pathParts);
    
    if (pathParts.length >= 2) {
      const folderUserId = pathParts[0];
      const fileName = pathParts.slice(1).join('/');
      console.log(`👤 Folder user ID: ${folderUserId}`);
      console.log(`📄 File name: ${fileName}`);
      console.log(`🔐 User ID match: ${folderUserId === user.id ? '✅' : '❌'}`);
    }
    
    // Check if file exists
    console.log('\n🔍 Checking if file exists...');
    const { data: fileList, error: listError } = await supabase.storage
      .from('documents')
      .list(pathParts[0] || '', {
        limit: 100,
        search: pathParts[1] || ''
      });
      
    if (listError) {
      console.error('❌ Error listing files:', listError);
    } else {
      console.log('📋 Files in directory:', fileList?.map(f => f.name));
      const fileExists = fileList?.some(f => f.name === pathParts[1]);
      console.log(`📄 File exists: ${fileExists ? '✅' : '❌'}`);
    }
    
    // Check storage policies directly
    console.log('\n🔐 Checking storage policies...');
    try {
      // List all policies on storage.objects
      const { data: policies, error: policiesError } = await (supabase as any).rpc('get_policies_for_table', {
        table_name: 'storage.objects'
      });
      
      if (!policiesError && policies) {
        console.log('📋 Storage policies found:', (policies as any).length);
        (policies as any).forEach((policy: any) => {
          if (policy.policyname.toLowerCase().includes('delete') || policy.policyname.toLowerCase().includes('documents')) {
            console.log(`🔐 Policy: ${policy.policyname}`);
            console.log(`   Type: ${policy.cmd} | Expression: ${policy.qual}`);
          }
        });
      }
    } catch (policyError) {
      console.log('ℹ️ Could not fetch policy details:', policyError);
    }
    
    // Try to delete the file
    console.log('\n🗑️ Attempting deletion...');
    const { error: deleteError } = await supabase.storage
      .from('documents')
      .remove([storagePath]);
      
    if (deleteError) {
      console.error('❌ Deletion failed:', deleteError);
      console.error('Error details:', JSON.stringify(deleteError, null, 2));
      
      // Check if it's a permission issue
      if (deleteError.message?.includes('permission') || deleteError.message?.includes('policy')) {
        console.log('\n🔐 Permission issue detected. Checking storage policies...');
        
        // Test the storage policy logic manually
        const folderName = storagePath.split('/')[0];
        console.log(`🧪 Testing policy logic: auth.uid()::text (${user.id}) = (storage.foldername(name))[1] (${folderName})`);
        console.log(`Match result: ${user.id === folderName ? '✅' : '❌'}`);
        
        // Suggest fixes
        console.log('\n💡 Possible fixes:');
        console.log('1. Check if storage path format matches policy expectations');
        console.log('2. Verify RLS policies on storage.objects table');
        console.log('3. Check for conflicting policies between documents and docs buckets');
        console.log('4. Test with debugStoragePermissions() function');
      }
    } else {
      console.log('✅ File deleted successfully!');
    }
    
  } catch (error) {
    console.error('🚨 Unexpected error during storage debug:', error);
  }
};

export const testStoragePermissions = async () => {
  console.log('🔐 Storage Permissions Test');
  console.log('===========================');
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ User not authenticated');
      return;
    }
    
    // Test creating a small file
    const testFileName = `test-${Date.now()}.txt`;
    const testPath = `${user.id}/${testFileName}`;
    const testContent = new Blob(['test content'], { type: 'text/plain' });
    
    console.log(`📝 Creating test file: ${testPath}`);
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(testPath, testContent);
      
    if (uploadError) {
      console.error('❌ Upload failed:', uploadError);
      return;
    }
    
    console.log('✅ Test file created successfully');
    
    // Try to delete it immediately
    console.log(`🗑️ Deleting test file: ${testPath}`);
    const { error: deleteError } = await supabase.storage
      .from('documents')
      .remove([testPath]);
      
    if (deleteError) {
      console.error('❌ Test deletion failed:', deleteError);
    } else {
      console.log('✅ Test deletion successful');
    }
    
  } catch (error) {
    console.error('🚨 Error during permissions test:', error);
  }
};

export const analyzeStoragePolicies = () => {
  console.log('📋 Storage Policy Analysis');
  console.log('==========================');
  console.log(`
Expected Storage Policy for DELETE:
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1])

This means:
1. The bucket must be 'documents' ✅
2. The authenticated user's ID must match the first folder in the path
3. Path format should be: user-id/filename.ext

Common issues:
❌ Path doesn't start with user ID
❌ User not authenticated when deletion runs
❌ Policy not properly applied
❌ Conflicting policies
❌ RLS not enabled on storage.objects

Troubleshooting steps:
1. Check if user is authenticated during deletion
2. Verify storage path format: {user.id}/{filename}
3. Check browser console for detailed error messages
4. Verify storage policies in Supabase dashboard
5. Test with manual file upload and deletion
  `);
};