#!/bin/bash

TARGET_DIR="src_localization"
LANG_LIST="JP EN"

for lang in $LANG_LIST
do
    echo "target languaage: $lang"

    # make grep -v filter
    filter=""
    for l in $LANG_LIST
    do
        if [[ "$l" != "$lang" ]]; then
            if [ -n "$filter" ]; then
                filter="$filter|"
            fi
            filter="$filter//LANG:$l"
        fi
    done
    echo "  grep filter: $filter"

    # make sed command
    command="s/LANG:${lang}//"
    echo "  sed command: $command"

    # generate
    mkdir -p $TARGET_DIR/$lang
    for f in $(ls src/)
    do
        echo "  generate: $TARGET_DIR/$lang/$f"
        grep -v -E $filter src/$f | sed $command > $TARGET_DIR/$lang/$f
    done
done
