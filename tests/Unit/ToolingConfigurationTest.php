<?php

test('tooling configuration supports pint biome and make targets', function () {
    $projectRoot = dirname(__DIR__, 2);

    $package = json_decode(
        file_get_contents($projectRoot.'/package.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );
    $biome = json_decode(
        file_get_contents($projectRoot.'/biome.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );
    $makefile = file_get_contents($projectRoot.'/Makefile');
    $agents = file_get_contents($projectRoot.'/AGENTS.md');

    expect($package['devDependencies'])
        ->toHaveKey('@biomejs/biome')
        ->and($biome['files']['ignoreUnknown'])->toBeTrue()
        ->and($biome['css']['parser']['tailwindDirectives'])->toBeTrue()
        ->and($biome['vcs']['useIgnoreFile'])->toBeTrue()
        ->and($makefile)->toContain(
            'format:',
            'lint:',
            'lint-check:',
            './vendor/bin/pint',
            './node_modules/.bin/biome',
        )
        ->and($agents)->toContain(
            'bun add',
            'composer require',
            'Do not manually add or change package versions',
        );
});
