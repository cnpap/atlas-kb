<?php

test('admin upload limits are aligned for one hundred megabyte files', function () {
    $maxUploadKilobytes = 102400;
    $swoolePackageMaxBytes = 128 * 1024 * 1024;

    expect(config('knowledge-templates.template_uploads.max_upload_kb'))->toBe($maxUploadKilobytes)
        ->and(config('knowledge-templates.reference_libraries.max_upload_kb'))->toBe($maxUploadKilobytes)
        ->and(config('livewire.temporary_file_upload.disk'))->toBe('local')
        ->and(config('livewire.temporary_file_upload.rules'))->toBe([
            'required',
            'file',
            'max:'.$maxUploadKilobytes,
        ])
        ->and(config('livewire.temporary_file_upload.max_upload_time'))->toBe(30)
        ->and(config('octane.swoole.options.package_max_length'))->toBe($swoolePackageMaxBytes)
        ->and(config('octane.max_execution_time'))->toBe(300);
});

test('docker runtime config raises php upload limits', function () {
    $dockerfile = file_get_contents(base_path('Dockerfile'));
    $phpUploadConfig = file_get_contents(base_path('docker/php/upload-limits.ini'));

    expect($dockerfile)->toContain('COPY docker/php/upload-limits.ini /usr/local/etc/php/conf.d/zz-atlas-upload-limits.ini')
        ->and($phpUploadConfig)->toContain('upload_max_filesize = 100M')
        ->and($phpUploadConfig)->toContain('post_max_size = 110M')
        ->and($phpUploadConfig)->toContain('memory_limit = 512M')
        ->and($phpUploadConfig)->toContain('max_input_time = 300')
        ->and($phpUploadConfig)->toContain('max_execution_time = 300');
});
