<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Validation Language Lines
    |--------------------------------------------------------------------------
    |
    | The following language lines contain the default error messages used by
    | the validator class. Some of these rules have multiple versions such
    | as the size rules. Feel free to tweak each of these messages here.
    |
    */

    'accepted' => ':attribute 必须接受。',
    'accepted_if' => '当 :other 为 :value 时，:attribute 必须接受。',
    'active_url' => ':attribute 不是有效的网址。',
    'after' => ':attribute 必须是晚于 :date 的日期。',
    'after_or_equal' => ':attribute 必须是等于或晚于 :date 的日期。',
    'alpha' => ':attribute 只能包含字母。',
    'alpha_dash' => ':attribute 只能包含字母、数字、短横线和下划线。',
    'alpha_num' => ':attribute 只能包含字母和数字。',
    'any_of' => ':attribute 无效。',
    'array' => ':attribute 必须是数组。',
    'ascii' => ':attribute 只能包含单字节字母、数字和符号。',
    'before' => ':attribute 必须是早于 :date 的日期。',
    'before_or_equal' => ':attribute 必须是等于或早于 :date 的日期。',
    'between' => [
        'array' => ':attribute 的项目数量必须在 :min 到 :max 之间。',
        'file' => ':attribute 的大小必须在 :min 到 :max KB 之间。',
        'numeric' => ':attribute 必须介于 :min 和 :max 之间。',
        'string' => ':attribute 的长度必须在 :min 到 :max 个字符之间。',
    ],
    'boolean' => ':attribute 必须为 true 或 false。',
    'can' => ':attribute 包含未授权的值。',
    'confirmed' => ':attribute 两次输入不一致。',
    'contains' => ':attribute 缺少必填值。',
    'current_password' => '当前密码不正确。',
    'date' => ':attribute 必须是有效日期。',
    'date_equals' => ':attribute 必须是等于 :date 的日期。',
    'date_format' => ':attribute 必须符合 :format 格式。',
    'decimal' => ':attribute 必须包含 :decimal 位小数。',
    'declined' => ':attribute 必须被拒绝。',
    'declined_if' => '当 :other 为 :value 时，:attribute 必须被拒绝。',
    'different' => ':attribute 和 :other 必须不同。',
    'digits' => ':attribute 必须是 :digits 位数字。',
    'digits_between' => ':attribute 必须是 :min 到 :max 位数字。',
    'dimensions' => ':attribute 的图片尺寸无效。',
    'distinct' => ':attribute 存在重复值。',
    'doesnt_contain' => ':attribute 不能包含以下任一内容：:values。',
    'doesnt_end_with' => ':attribute 不能以下列任一内容结尾：:values。',
    'doesnt_start_with' => ':attribute 不能以下列任一内容开头：:values。',
    'email' => ':attribute 必须是有效的邮箱地址。',
    'encoding' => ':attribute 必须采用 :encoding 编码。',
    'ends_with' => ':attribute 必须以下列任一内容结尾：:values。',
    'enum' => '所选的 :attribute 无效。',
    'exists' => '所选的 :attribute 无效。',
    'extensions' => ':attribute 的扩展名必须是以下之一：:values。',
    'file' => ':attribute 必须是文件。',
    'filled' => ':attribute 必须填写。',
    'gt' => [
        'array' => ':attribute 的项目数量必须大于 :value。',
        'file' => ':attribute 必须大于 :value KB。',
        'numeric' => ':attribute 必须大于 :value。',
        'string' => ':attribute 的长度必须大于 :value 个字符。',
    ],
    'gte' => [
        'array' => ':attribute 的项目数量必须不少于 :value。',
        'file' => ':attribute 必须大于或等于 :value KB。',
        'numeric' => ':attribute 必须大于或等于 :value。',
        'string' => ':attribute 的长度必须大于或等于 :value 个字符。',
    ],
    'hex_color' => ':attribute 必须是有效的十六进制颜色值。',
    'image' => ':attribute 必须是图片。',
    'in' => '所选的 :attribute 无效。',
    'in_array' => ':attribute 必须存在于 :other 中。',
    'in_array_keys' => ':attribute 必须至少包含以下键之一：:values。',
    'integer' => ':attribute 必须是整数。',
    'ip' => ':attribute 必须是有效的 IP 地址。',
    'ipv4' => ':attribute 必须是有效的 IPv4 地址。',
    'ipv6' => ':attribute 必须是有效的 IPv6 地址。',
    'json' => ':attribute 必须是有效的 JSON 字符串。',
    'list' => ':attribute 必须是列表。',
    'lowercase' => ':attribute 必须为小写。',
    'lt' => [
        'array' => ':attribute 的项目数量必须少于 :value。',
        'file' => ':attribute 必须小于 :value KB。',
        'numeric' => ':attribute 必须小于 :value。',
        'string' => ':attribute 的长度必须少于 :value 个字符。',
    ],
    'lte' => [
        'array' => ':attribute 的项目数量不能超过 :value。',
        'file' => ':attribute 必须小于或等于 :value KB。',
        'numeric' => ':attribute 必须小于或等于 :value。',
        'string' => ':attribute 的长度必须小于或等于 :value 个字符。',
    ],
    'mac_address' => ':attribute 必须是有效的 MAC 地址。',
    'max' => [
        'array' => ':attribute 的项目数量不能超过 :max。',
        'file' => ':attribute 不能大于 :max KB。',
        'numeric' => ':attribute 不能大于 :max。',
        'string' => ':attribute 的长度不能大于 :max 个字符。',
    ],
    'max_digits' => ':attribute 的位数不能超过 :max。',
    'mimes' => ':attribute 必须是以下类型的文件：:values。',
    'mimetypes' => ':attribute 必须是以下 MIME 类型的文件：:values。',
    'min' => [
        'array' => ':attribute 的项目数量至少为 :min。',
        'file' => ':attribute 至少为 :min KB。',
        'numeric' => ':attribute 必须至少为 :min。',
        'string' => ':attribute 的长度至少为 :min 个字符。',
    ],
    'min_digits' => ':attribute 的位数至少为 :min。',
    'missing' => ':attribute 必须缺失。',
    'missing_if' => '当 :other 为 :value 时，:attribute 必须缺失。',
    'missing_unless' => '除非 :other 为 :value，否则 :attribute 必须缺失。',
    'missing_with' => '当 :values 存在时，:attribute 必须缺失。',
    'missing_with_all' => '当 :values 都存在时，:attribute 必须缺失。',
    'multiple_of' => ':attribute 必须是 :value 的倍数。',
    'not_in' => '所选的 :attribute 无效。',
    'not_regex' => ':attribute 的格式无效。',
    'numeric' => ':attribute 必须是数字。',
    'password' => [
        'letters' => ':attribute 至少需要包含一个字母。',
        'mixed' => ':attribute 至少需要包含一个大写字母和一个小写字母。',
        'numbers' => ':attribute 至少需要包含一个数字。',
        'symbols' => ':attribute 至少需要包含一个符号。',
        'uncompromised' => '该 :attribute 已出现在数据泄露中，请更换为其他 :attribute。',
    ],
    'present' => ':attribute 必须存在。',
    'present_if' => '当 :other 为 :value 时，:attribute 必须存在。',
    'present_unless' => '除非 :other 为 :value，否则 :attribute 必须存在。',
    'present_with' => '当 :values 存在时，:attribute 必须存在。',
    'present_with_all' => '当 :values 都存在时，:attribute 必须存在。',
    'prohibited' => ':attribute 被禁止填写。',
    'prohibited_if' => '当 :other 为 :value 时，:attribute 被禁止填写。',
    'prohibited_if_accepted' => '当 :other 已被接受时，:attribute 被禁止填写。',
    'prohibited_if_declined' => '当 :other 已被拒绝时，:attribute 被禁止填写。',
    'prohibited_unless' => '除非 :other 位于 :values 中，否则 :attribute 被禁止填写。',
    'prohibits' => ':attribute 不允许 :other 同时出现。',
    'regex' => ':attribute 的格式无效。',
    'required' => ':attribute 不能为空。',
    'required_array_keys' => ':attribute 必须包含以下键：:values。',
    'required_if' => '当 :other 为 :value 时，:attribute 不能为空。',
    'required_if_accepted' => '当 :other 已被接受时，:attribute 不能为空。',
    'required_if_declined' => '当 :other 已被拒绝时，:attribute 不能为空。',
    'required_unless' => '除非 :other 位于 :values 中，否则 :attribute 不能为空。',
    'required_with' => '当 :values 存在时，:attribute 不能为空。',
    'required_with_all' => '当 :values 都存在时，:attribute 不能为空。',
    'required_without' => '当 :values 不存在时，:attribute 不能为空。',
    'required_without_all' => '当 :values 都不存在时，:attribute 不能为空。',
    'same' => ':attribute 和 :other 必须一致。',
    'size' => [
        'array' => ':attribute 必须包含 :size 个项目。',
        'file' => ':attribute 必须为 :size KB。',
        'numeric' => ':attribute 必须为 :size。',
        'string' => ':attribute 必须为 :size 个字符。',
    ],
    'starts_with' => ':attribute 必须以下列任一内容开头：:values。',
    'string' => ':attribute 必须是字符串。',
    'timezone' => ':attribute 必须是有效的时区。',
    'unique' => ':attribute 已被占用。',
    'uploaded' => ':attribute 上传失败。',
    'uppercase' => ':attribute 必须为大写。',
    'url' => ':attribute 必须是有效的网址。',
    'ulid' => ':attribute 必须是有效的 ULID。',
    'uuid' => ':attribute 必须是有效的 UUID。',

    /*
    |--------------------------------------------------------------------------
    | Custom Validation Language Lines
    |--------------------------------------------------------------------------
    |
    | Here you may specify custom validation messages for attributes using the
    | convention "attribute.rule" to name the lines. This makes it quick to
    | specify a specific custom language line for a given attribute rule.
    |
    */

    'custom' => [
        'attribute-name' => [
            'rule-name' => 'custom-message',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Custom Validation Attributes
    |--------------------------------------------------------------------------
    |
    | The following language lines are used to swap our attribute placeholder
    | with something more reader friendly such as "E-Mail Address" instead
    | of "email". This simply helps us make our message more expressive.
    |
    */

    'attributes' => [
        'email' => '邮箱地址',
        'name' => '姓名',
        'password' => '密码',
        'password_confirmation' => '确认密码',
        'current_password' => '当前密码',
        'new_password' => '新密码',
        'code' => '验证码',
        'token' => '令牌',
    ],

];
