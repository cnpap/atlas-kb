<?php

namespace App\Providers;

use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeUser;
use Carbon\CarbonImmutable;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
        $this->configureRateLimiting();
        $this->configureRouteBindings();
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);
        CarbonImmutable::setLocale(app()->getLocale());

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }

    protected function configureRateLimiting(): void
    {
        RateLimiter::for('knowledge-template-read', function (Request $request): Limit {
            return Limit::perMinute(120)
                ->by($request->ip() ?: 'unknown')
                ->response(fn (Request $request, array $headers) => response()->json([
                    'message' => '请求过于频繁，请稍后再试。',
                ], 429, $headers));
        });

        RateLimiter::for('knowledge-template-export-create', function (Request $request): Limit {
            return Limit::perMinute(30)
                ->by($request->ip() ?: 'unknown')
                ->response(fn (Request $request, array $headers) => response()->json([
                    'message' => '导出请求过于频繁，请稍后再试。',
                ], 429, $headers));
        });

        RateLimiter::for('knowledge-template-export-list', function (Request $request): Limit {
            return Limit::perMinute(60)
                ->by($request->ip() ?: 'unknown')
                ->response(fn (Request $request, array $headers) => response()->json([
                    'message' => '查询请求过于频繁，请稍后再试。',
                ], 429, $headers));
        });
    }

    protected function configureRouteBindings(): void
    {
        Route::bind('assignedKnowledgeTemplate', function (string $value, RoutingRoute $route): KnowledgeTemplate {
            $routeKnowledgeUser = $route->parameter('knowledgeUser');
            $knowledgeUser = $routeKnowledgeUser instanceof KnowledgeUser
                ? $routeKnowledgeUser
                : KnowledgeUser::query()->findOrFail((string) $routeKnowledgeUser);

            return $knowledgeUser->assignedKnowledgeTemplates()
                ->available()
                ->with('fields')
                ->findOrFail($value);
        });
    }
}
