<?php

test('knowledge assistant role form uses a single-column stacked layout', function () {
    $source = file_get_contents(dirname(__DIR__, 2).'/app/Filament/Resources/KnowledgeAssistantRoles/Schemas/KnowledgeAssistantRoleForm.php');

    expect($source)->toContain('->columns(1)')
        ->and($source)->toContain("Section::make('基础信息')")
        ->and($source)->toContain("Section::make('系统提示词')")
        ->and($source)->toContain("Section::make('风格提示词')")
        ->and($source)->not->toContain('Group::make()')
        ->and($source)->not->toContain("'xl' => 12")
        ->and($source)->not->toContain("'xl' => 8");
});
