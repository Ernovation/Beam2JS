%% Runs one OTP test case the way Common Test does: init_per_suite,
%% init_per_group for each enclosing group, init_per_testcase, the case
%% itself, and the matching end functions. All steps run in this process.
-module(otp_ct_driver).
-export([run/4]).

run(Suite, Groups, Case, Config0) ->
    {module, Suite} = code:ensure_loaded(Suite),
    try
        Config1 = init(Suite, init_per_suite, [], Config0),
        {Config2, Entered} = enter_groups(Suite, Groups, Config1, []),
        Config3 = init(Suite, init_per_testcase, [Case], Config2),
        try
            run_test_case_eval(Suite, Case, Config3)
        after
            _ = cleanup(Suite, end_per_testcase, [Case, Config3]),
            _ = [cleanup(Suite, end_per_group, [Group, Config]) || {Group, Config} <- Entered],
            _ = cleanup(Suite, end_per_suite, [Config1])
        end
    catch
        throw:{otp_ct_driver, Result} -> Result
    end.

%% test_server calls the case through a few non-tail frames; tests such
%% as exception_SUITE:backtrace_depth rely on that stack depth.
run_test_case_eval(Suite, Case, Config) ->
    try run_test_case_eval1(Suite, Case, Config) of
        Result -> Result
    catch
        Class:Reason:Stack -> erlang:raise(Class, Reason, Stack)
    end.

run_test_case_eval1(Suite, Case, Config) ->
    try ts_tc(Suite, Case, Config) of
        Result -> Result
    catch
        Class:Reason:Stack -> erlang:raise(Class, Reason, Stack)
    end.

ts_tc(Suite, Case, Config) ->
    try Suite:Case(Config) of
        Result -> Result
    catch
        Class:Reason:Stack -> erlang:raise(Class, Reason, Stack)
    end.

enter_groups(_Suite, [], Config, Entered) ->
    {Config, Entered};
enter_groups(Suite, [Group | Groups], Config0, Entered) ->
    Config = init(Suite, init_per_group, [Group], Config0),
    enter_groups(Suite, Groups, Config, [{Group, Config} | Entered]).

init(Suite, Function, Args, Config) ->
    case erlang:function_exported(Suite, Function, length(Args) + 1) of
        false ->
            Config;
        true ->
            case apply(Suite, Function, Args ++ [Config]) of
                NewConfig when is_list(NewConfig) -> NewConfig;
                {skip, _} = Skip -> throw({otp_ct_driver, Skip});
                {skipped, _} = Skip -> throw({otp_ct_driver, Skip});
                {fail, _} = Fail -> throw({otp_ct_driver, Fail});
                Other -> error({bad_return, Function, Other})
            end
    end.

cleanup(Suite, Function, Args) ->
    case erlang:function_exported(Suite, Function, length(Args)) of
        true -> catch apply(Suite, Function, Args);
        false -> ok
    end.
