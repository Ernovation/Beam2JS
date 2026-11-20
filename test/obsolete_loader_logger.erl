-module(obsolete_loader_logger).
-export([log/2]).

log(Event, #{config := #{recipient := Recipient}}) ->
    Recipient ! {loader_log, logger_formatter:format(Event, #{})},
    ok.
