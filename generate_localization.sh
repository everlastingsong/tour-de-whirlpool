#!/bin/bash

SRC_DIR="src_i18n"
TARGET_DIR="src"
LANG_LIST="JP EN KR"

for lang in $LANG_LIST
do
    echo "target language: $lang"

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

    # make sec commands
    remove_lang_prefix="s/LANG:${lang}//"
    replace_wallet_path='s|import secret from "\.\./wallet.json"|import secret from "\.\./\.\./wallet.json"|g'

    echo "  sed command (remove lang prefix): $remove_lang_prefix"
    echo "  sed command (replace wallet path): $replace_wallet_path"

    # generate
    mkdir -p $TARGET_DIR/$lang
    for f in $(ls $SRC_DIR)
    do
        echo "  generate: $TARGET_DIR/$lang/$f"
        grep -v -E $filter $SRC_DIR/$f | sed -e "$remove_lang_prefix" -e "$replace_wallet_path" > $TARGET_DIR/$lang/$f
    done
done
