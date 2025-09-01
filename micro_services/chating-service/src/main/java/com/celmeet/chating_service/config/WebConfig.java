package com.celmeet.chating_service.config;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.CharacterEncodingFilter;

@Configuration
public class WebConfig {

//    @Bean
//    public FilterRegistrationBean<CharacterEncodingFilter> characterEncodingFilter() {
//        CharacterEncodingFilter filter = new CharacterEncodingFilter();
//        filter.setEncoding("UTF-8");
//        filter.setForceEncoding(true);
//        FilterRegistrationBean<CharacterEncodingFilter> registrationBean =
//                new FilterRegistrationBean<>();
//        registrationBean.setFilter(filter);
//        registrationBean.addUrlPatterns("/*");
//        return registrationBean;
//    }

}
