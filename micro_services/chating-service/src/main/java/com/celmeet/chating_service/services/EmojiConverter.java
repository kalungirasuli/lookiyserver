package com.celmeet.chating_service.services;

import com.vdurmont.emoji.EmojiParser;
import org.springframework.stereotype.Service;

@Service
public class EmojiConverter {

    public String convertToDatabase(String input) {
        if (input == null) return null;
        return EmojiParser.parseToAliases(input); // Using emoji-java library
    }

    // Convert back when retrieving from DB
    public String convertFromDatabase(String input) {
        if (input == null) return null;
        return EmojiParser.parseToUnicode(input);
    }

}
